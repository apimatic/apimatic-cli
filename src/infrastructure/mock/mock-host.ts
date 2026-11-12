import { Buffer } from 'node:buffer';
import { createServer, IncomingMessage, Server, ServerOptions, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { err, Result } from 'neverthrow';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { LoggedRequest, REQUEST_LOG_CAPACITY, RequestLog } from '../../types/mock/routing/request-log.js';
import { requestOrigin, unreadableHost } from '../../types/mock/routing/request-origin.js';
import { respond } from '../../types/mock/routing/respond.js';
import { StubRouter } from '../../types/mock/routing/stub-router.js';
import { TokenLifetime } from '../../types/mock/routing/token-lifetime.js';
import { headerValues, requestModelOf } from '../../types/mock/routing/wire-request.js';
import { wireRefusal, WireResponse } from '../../types/mock/routing/wire-response.js';
import { StubProblem } from '../../types/mock/stub-format/stub-problem.js';
import { StubSet } from '../../types/mock/stub-format/stub.js';
import { decodeUtf8 } from '../../types/mock/text/utf8.js';
import { errorMessage } from '../../utils/error-utils.js';
import { sleep } from '../timer-extensions.js';
import { describeListen, fixedPlace, FixedPlace, Listen, LOCALHOST, originOf } from './listen.js';
import { addressesOf, busyReason, closed, Listening, listenOnAll } from './listeners.js';
import { writePaced } from './paced-body.js';
import { readBody } from './request-body.js';
import { StubDirectoryService } from './stub-directory-service.js';

/**
 * How often a free port is tried: the port the system chose on one loopback can be held by
 * another process on the other. One such collision is chance, three in a row mean something else
 * is wrong.
 */
export const FREE_PORT_ATTEMPTS = 3;

/** How long a stop waits for the requests being answered before it closes their connections. */
const STOP_GRACE_MS = 5000;

/** A request without a Host gets the mock's own answer, worded as every unreadable Host is; @types/node 22 does not declare the option. */
const SERVER_OPTIONS: ServerOptions & { requireHostHeader: boolean } = { requireHostHeader: false };

const REFUSALS: Record<string, string> = {
  HPE_HEADER_OVERFLOW: '431 Request Header Fields Too Large',
  ERR_HTTP_REQUEST_TIMEOUT: '408 Request Timeout'
};

export interface MockHostOptions {
  readonly stubs: DirectoryPath;
  readonly listen: Listen;
  readonly tokenLifetime: TokenLifetime;
  /** Hears of every request that reached the router, with what came of it. */
  readonly onRequest?: (request: LoggedRequest) => void;
}

/** What starting the mock came to: a running host, or one of the two failures a harness tells apart. */
export type StartResult =
  | { readonly kind: 'running'; readonly host: MockHost }
  | { readonly kind: 'stubProblems'; readonly problems: readonly StubProblem[] }
  | { readonly kind: 'notListening'; readonly where: Listen; readonly reason: string };

export function notListeningMessage(where: Listen, reason: string): string {
  return `The mock could not start on ${describeListen(where)}: ${reason}`;
}

/**
 * The running mock: plain `node:http` servers that hand every request to the `StubRouter` and
 * write what it decided. The host reads and writes; it decides nothing about a stub.
 */
export class MockHost {
  /** The origin that was asked for, for example http://localhost:51234. */
  public readonly url: string;
  public readonly stubs: StubSet;
  private readonly servers: readonly Server[];
  private readonly exchanges: ReadonlySet<Promise<void>>;
  private readonly stopping: AbortController;

  private constructor(
    url: string,
    stubs: StubSet,
    servers: readonly Server[],
    exchanges: ReadonlySet<Promise<void>>,
    stopping: AbortController
  ) {
    this.url = url;
    this.stubs = stubs;
    this.servers = servers;
    this.exchanges = exchanges;
    this.stopping = stopping;
  }

  /** Loads the stubs and listens; each expected failure is a case of the result, never an exception. */
  public static async start(options: MockHostOptions): Promise<StartResult> {
    const stubs = await new StubDirectoryService().load(options.stubs);
    return stubs.isErr() ? { kind: 'stubProblems', problems: stubs.error } : MockHost.serve(stubs.value, options);
  }

  /**
   * `pick` names the port a free-port attempt tries, 0 leaving the choice to the system. It is a
   * parameter so a test can offer a port that is already taken, as another process may take one of
   * the loopbacks between the two binds.
   */
  public static async serve(
    stubs: StubSet,
    options: MockHostOptions,
    pick: () => number = () => 0
  ): Promise<StartResult> {
    const router = new StubRouter(stubs, options.tokenLifetime);
    const log = new RequestLog(REQUEST_LOG_CAPACITY, options.onRequest);
    const exchanges = new Set<Promise<void>>();
    const stopping = new AbortController();
    const create = () =>
      createServer(SERVER_OPTIONS, (request, response) => {
        const exchange = answer(router, log, request, response, stopping.signal);
        exchanges.add(exchange);
        void exchange.finally(() => exchanges.delete(exchange));
      }).on('clientError', refuseUnreadable);

    const { listen } = options;
    const opened = listen.kind === 'fixed' ? await openFixed(create, listen) : await openFree(create, pick);
    if (opened.isErr()) {
      return { kind: 'notListening', where: listen, reason: opened.error };
    }
    const place = listen.kind === 'fixed' ? listen : fixedPlace(LOCALHOST, opened.value.port);
    return {
      kind: 'running',
      host: new MockHost(originOf(place), stubs, opened.value.servers, exchanges, stopping)
    };
  }

  /**
   * Stops listening, ends every stream where it stands and lets the requests being answered
   * finish; a connection still open after the grace is closed, so a stop never hangs on a client.
   */
  public async stop(): Promise<void> {
    this.stopping.abort();
    const closing = this.servers.map(closed);
    const patience = new AbortController();
    await Promise.race([Promise.allSettled([...this.exchanges]), sleep(STOP_GRACE_MS, patience.signal)]);
    patience.abort();
    this.servers.forEach((server) => server.closeAllConnections());
    await Promise.all(closing);
  }
}

/** One try at the origin as given: a busy port is the answer there, never another port. */
async function openFixed(create: () => Server, place: FixedPlace): Promise<Result<Listening, string>> {
  const addresses = addressesOf(place.host);
  const busy = await busyReason(addresses, place.port);
  return busy === undefined ? listenOnAll(create, addresses, place.port) : err(busy);
}

async function openFree(create: () => Server, pick: () => number): Promise<Result<Listening, string>> {
  let opened = await listenOnAll(create, addressesOf(LOCALHOST), pick());
  for (let attempt = 1; attempt < FREE_PORT_ATTEMPTS && opened.isErr(); attempt++) {
    opened = await listenOnAll(create, addressesOf(LOCALHOST), pick());
  }
  return opened;
}

/** Settles when the response is done, whatever came of it, so a stop can wait for it. */
async function answer(
  router: StubRouter,
  log: RequestLog,
  request: IncomingMessage,
  response: ServerResponse,
  stopping: AbortSignal
): Promise<void> {
  try {
    await send(response, await decide(router, log, request), stopping);
  } catch (error) {
    if (response.headersSent || response.destroyed) {
      response.destroy();
      return;
    }
    const failure = wireRefusal(500, `The mock failed to answer: ${errorMessage(error)}`);
    await send(response, failure, stopping).catch(() => response.destroy());
  }
}

async function decide(router: StubRouter, log: RequestLog, request: IncomingMessage): Promise<WireResponse> {
  const lines = headerLines(request.rawHeaders);
  const hosts = headerValues(lines, 'Host');
  const origin = requestOrigin(hosts);
  const body = await readBody(request);
  if (origin === undefined) {
    return wireRefusal(400, unreadableHost(hosts));
  }
  if (body.isErr()) {
    return wireRefusal(413, body.error);
  }
  return respond(router, log, requestModelOf(request.method ?? '', request.url ?? '', lines, body.value), origin);
}

/** Header lines one by one: Node's own `headers` joins or drops a header sent twice, and a stub must see both. */
function headerLines(raw: readonly string[]): [string, string][] {
  return Array.from({ length: raw.length / 2 }, (_, index) => [raw[index * 2], asSent(raw[index * 2 + 1])]);
}

/** Node hands a header value over read as Latin-1, one character per byte; a client that sent UTF-8 meant UTF-8. */
function asSent(text: string): string {
  const isAscii = Array.from(text).every((character) => character.charCodeAt(0) < 0x80);
  return isAscii ? text : decodeUtf8(Buffer.from(text, 'latin1')) ?? text;
}

async function send(response: ServerResponse, wire: WireResponse, stopping: AbortSignal): Promise<void> {
  const done = new Promise<void>((resolve) => {
    response.once('close', resolve);
  });
  response.writeHead(
    wire.status,
    wire.headers.flatMap(({ name, value }) => [name, value])
  );
  if (wire.body.kind === 'whole') {
    response.end(wire.body.bytes);
  } else {
    await writePaced(response, wire.body.chunks, wire.body.delayMs, stopping);
  }
  await done;
}

/**
 * A request Node's parser rejects (a method it does not know, a malformed request line, headers
 * past its limit) never reaches the router, so it gets the parser's reason instead of a 418.
 */
function refuseUnreadable(error: NodeJS.ErrnoException, socket: Duplex): void {
  if (!socket.writable || error.code === 'ECONNRESET') {
    socket.destroy();
    return;
  }
  const reason = `The mock could not read this request as HTTP: ${error.message}`;
  socket.end(
    [
      `HTTP/1.1 ${REFUSALS[error.code ?? ''] ?? '400 Bad Request'}`,
      'Content-Type: text/plain; charset=utf-8',
      `Content-Length: ${Buffer.byteLength(reason)}`,
      'Connection: close',
      '',
      reason
    ].join('\r\n')
  );
}
