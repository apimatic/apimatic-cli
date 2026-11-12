import { Buffer } from 'node:buffer';
import fs from 'fs';
import http from 'node:http';
import net from 'node:net';
import os from 'os';
import path from 'path';
import { URL } from 'node:url';
import { FREE_PORT } from '../../src/infrastructure/mock/listen.js';
import {
  MockHost,
  MockHostOptions,
  notListeningMessage,
  StartResult
} from '../../src/infrastructure/mock/mock-host.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { readJson } from '../../src/types/mock/json/json-reader.js';
import { compareJson } from '../../src/types/mock/matching/json-diff.js';
import { LIFETIME_FROM_STUB } from '../../src/types/mock/routing/token-lifetime.js';
import { describeProblems } from '../../src/types/mock/stub-format/stub-problem.js';
import { TestRequest } from './mock-requests.js';
import { StubFiles, stubFixtures } from './mock-stubs.js';

export type HostSettings = Partial<Omit<MockHostOptions, 'stubs'>>;

/** What came back, with the headers line by line as sent. */
export class Answered {
  public readonly status: number;
  public readonly body: Buffer;
  /** How long after the first piece of the body its last piece arrived: about nothing for a body sent whole. */
  public readonly spreadMs: number;
  private readonly lines: readonly (readonly [string, string])[];

  public constructor(status: number, lines: readonly (readonly [string, string])[], body: Buffer, spreadMs = 0) {
    this.status = status;
    this.lines = lines;
    this.body = body;
    this.spreadMs = spreadMs;
  }

  /** The `data:` lines of a text/event-stream, one entry per line. */
  public sseData(): string[] {
    return this.text()
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length));
  }

  /** Every value sent under the name, joined with a comma, or empty when the header is absent. */
  public header(name: string): string {
    return this.lines
      .filter(([sent]) => sent.toLowerCase() === name.toLowerCase())
      .map(([, value]) => value)
      .join(', ');
  }

  public text(): string {
    return this.body.toString('utf8');
  }

  public json(): any {
    return JSON.parse(this.text());
  }

  /** The body of an answer of this status; any other status fails here with the body, so a 418 shows the mock's report. */
  public expect(status: number): string {
    if (this.status !== status) {
      throw new Error(`Expected status ${status} but got ${this.status}: ${this.text()}`);
    }
    return this.text();
  }

  public expectJson(status: number): any {
    return JSON.parse(this.expect(status));
  }

  /** The differences of a 418 report, after checking that it is one. */
  public expectMismatch(): Difference[] {
    const report = this.expectJson(418);
    if (this.header('Content-Type') !== 'application/problem+json' || this.header('X-Mock-Mismatch') === '') {
      throw new Error(`The 418 is not the mock's report: ${this.text()}`);
    }
    return report.differences;
  }
}

export interface Difference {
  readonly where: string;
  readonly name: string;
  readonly expected: string;
  readonly actual: string;
}

/** Where a report differs, as `where name` pairs a test can look a field up in. */
export function placesOf(differences: readonly Difference[]): string[] {
  return differences.map((difference) => `${difference.where} ${difference.name}`.trimEnd());
}

/** Structural differences by the mock's own comparison, so int64 digits and absent-versus-null count. */
export function jsonDifferences(expected: string, actual: string): string[] {
  return compareJson(readJson(expected)._unsafeUnwrap(), readJson(actual)._unsafeUnwrap()).map(String);
}

/** Sends the request as built, with no header added but Host and the body's framing, and no redirect followed. */
function dispatch(
  origin: string,
  request: TestRequest,
  answered: (response: http.IncomingMessage) => void,
  failed: (error: Error) => void
): http.ClientRequest {
  const { method, target, headers, body, chunked } = request.toWire();
  const { hostname, port, host } = new URL(origin);
  const names = headers.map(([name]) => name.toLowerCase());
  const framing: [string, string][] = chunked
    ? [['Transfer-Encoding', 'chunked']]
    : body.length > 0
    ? [['Content-Length', String(body.length)]]
    : [];
  const lines: [string, string][] = [
    ...(names.includes('host') ? [] : [['Host', host] as [string, string]]),
    ...headers,
    ...framing
  ];
  const sent = http.request(
    {
      host: unbracketed(hostname),
      port,
      method,
      path: target,
      headers: linesByName(lines),
      setHost: false,
      agent: false
    },
    answered
  );
  sent.on('error', failed);
  sent.end(body.length > 0 ? body : undefined);
  return sent;
}

export function send(origin: string, request: TestRequest): Promise<Answered> {
  return new Promise((resolve, reject) => {
    dispatch(
      origin,
      request,
      (response) => {
        const chunks: Buffer[] = [];
        const arrivals: number[] = [];
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          arrivals.push(Date.now());
        });
        response.on('end', () => {
          const spreadMs = arrivals.length === 0 ? 0 : arrivals[arrivals.length - 1] - arrivals[0];
          resolve(
            new Answered(response.statusCode ?? 0, pairsOf(response.rawHeaders), Buffer.concat(chunks), spreadMs)
          );
        });
        response.on('error', reject);
      },
      reject
    );
  });
}

/** A body being read as it arrives: its first piece, the rest once the body ends however it ends, and a way to walk out. */
export interface OpenStream {
  readonly first: string;
  readonly rest: Promise<string>;
  leave(): void;
}

/** Resolves as soon as the first piece of the body is in, so a test can act while the stream is still open. */
export function openStream(origin: string, request: TestRequest): Promise<OpenStream> {
  return new Promise((resolve, reject) => {
    const sent = dispatch(
      origin,
      request,
      (response) => {
        response.once('data', (first: Buffer) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('error', () => undefined);
          const rest = new Promise<string>((ended) => {
            response.on('close', () => ended(Buffer.concat(chunks).toString('utf8')));
          });
          resolve({ first: first.toString('utf8'), rest, leave: () => sent.destroy() });
        });
      },
      reject
    );
  });
}

/**
 * Writes the request head line for line over a socket and reads the whole answer as text: Node's
 * client upper-cases a method and always sends a Host, which hides what other clients send. An
 * HTTP/1.1 head needs its own `Connection: close`, or the read never ends.
 */
export function sendHead(origin: string, head: readonly string[]): Promise<string> {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: unbracketed(hostname), port: Number(port) });
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
    socket.on('error', reject);
    socket.write([...head, '', ''].join('\r\n'));
  });
}

/** A listener on a port the system chose, busy until it is closed. */
export function occupied(address: string): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.destroy());
    server.once('error', reject);
    server.listen({ host: address, port: 0 }, () => resolve(server));
  });
}

export function portOf(server: net.Server): number {
  return (server.address() as net.AddressInfo).port;
}

export function released(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

export function hasIpv6Loopback(): boolean {
  return Object.values(os.networkInterfaces()).some((addresses) =>
    (addresses ?? []).some((each) => each.address === '::1')
  );
}

/** The host of a start that had to succeed; a failed one throws what the command would print. */
export function running(result: StartResult): MockHost {
  switch (result.kind) {
    case 'running':
      return result.host;
    case 'stubProblems':
      throw new Error(describeProblems(result.problems));
    case 'notListening':
      throw new Error(notListeningMessage(result.where, result.reason));
  }
}

export function optionsFor(directory: string, settings: HostSettings = {}): MockHostOptions {
  return { stubs: new DirectoryPath(directory), listen: FREE_PORT, tokenLifetime: LIFETIME_FROM_STUB, ...settings };
}

/** A running mock as a test talks to it. */
export class TestMock {
  public readonly host: MockHost;

  public constructor(host: MockHost) {
    this.host = host;
  }

  public get url(): string {
    return this.host.url;
  }

  public send(request: TestRequest): Promise<Answered> {
    return send(this.url, request);
  }

  public stream(request: TestRequest): Promise<OpenStream> {
    return openStream(this.url, request);
  }

  public sendHead(...head: string[]): Promise<string> {
    return sendHead(this.url, head);
  }

  /** A complete HTTP/1.1 head with the method and target exactly as given. */
  public sendRaw(method: string, target: string, ...headers: string[]): Promise<string> {
    const { host } = new URL(this.url);
    return sendHead(this.url, [`${method} ${target} HTTP/1.1`, `Host: ${host}`, 'Connection: close', ...headers]);
  }
}

/** One mock over a stub set of test/resources/mock for a whole `describe` block, on a free port. */
export function mockOver(set: string): () => TestMock {
  let mock: TestMock | undefined;
  before(async () => {
    mock = new TestMock(running(await MockHost.start(optionsFor(path.join(stubFixtures, set)))));
  });
  after(async () => {
    await mock?.host.stop();
  });
  return () => {
    if (mock === undefined) {
      throw new Error(`The mock over the ${set} stubs has not started.`);
    }
    return mock;
  };
}

/** Throw-away stub directories and the mocks over them, each stopped and deleted after its test. */
export function tempMocks() {
  const directories: string[] = [];
  const hosts: MockHost[] = [];

  afterEach(async () => {
    await Promise.all(hosts.splice(0).map((host) => host.stop()));
    directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
  });

  const directory = (files: StubFiles = {}): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apimatic-mock-host-'));
    directories.push(root);
    Object.entries(files).forEach(([name, content]) => fs.writeFileSync(path.join(root, name), content));
    return root;
  };

  /** Starts without insisting, so a test can read a refusal; a host that did start is stopped afterwards. */
  const tryStart = async (files: StubFiles = {}, settings: HostSettings = {}): Promise<StartResult> => {
    const result = await MockHost.start(optionsFor(directory(files), settings));
    if (result.kind === 'running') {
      hosts.push(result.host);
    }
    return result;
  };

  const start = async (files: StubFiles = {}, settings: HostSettings = {}): Promise<TestMock> =>
    new TestMock(running(await tryStart(files, settings)));

  /** For a host a test started through another door, so it is stopped with the rest. */
  const track = (result: StartResult): StartResult => {
    if (result.kind === 'running') {
      hosts.push(result.host);
    }
    return result;
  };

  return { directory, start, tryStart, track };
}

/** A header sent twice stays two lines: Node's client writes one line per value of a name. */
function linesByName(lines: readonly (readonly [string, string])[]): Record<string, string | string[]> {
  const byName: Record<string, string | string[]> = {};
  for (const [name, value] of lines) {
    const sent = Object.keys(byName).find((each) => each.toLowerCase() === name.toLowerCase()) ?? name;
    byName[sent] = sent in byName ? [byName[sent], value].flat() : value;
  }
  return byName;
}

function pairsOf(raw: readonly string[]): [string, string][] {
  return Array.from({ length: raw.length / 2 }, (_, index) => [raw[index * 2], raw[index * 2 + 1]]);
}

function unbracketed(hostname: string): string {
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}
