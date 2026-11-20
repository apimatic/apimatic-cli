import { Buffer } from 'node:buffer';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { envInfo } from '../../src/infrastructure/env-info.js';

export const GENERATION_ID = '019fdbef-91d5-7a1f-81c2-866af5d76fe9';

export interface ReceivedRequest {
  readonly url: string;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: string;
}

/** How one route answers; `attempt` counts the requests that route has had, from 1. */
export type Respond = (response: http.ServerResponse, attempt: number) => void;

export const json =
  (statusCode: number, body: unknown): Respond =>
  (response) => {
    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };

export const problem =
  (statusCode: number, body: unknown): Respond =>
  (response) => {
    response.writeHead(statusCode, { 'Content-Type': 'application/problem+json' });
    response.end(JSON.stringify(body));
  };

export const bare =
  (statusCode: number): Respond =>
  (response) => {
    response.writeHead(statusCode);
    response.end();
  };

export const zip =
  (content: Buffer): Respond =>
  (response) => {
    response.writeHead(200, { 'Content-Type': 'application/zip' });
    response.end(content);
  };

/** A finished run is a redirect to the download, as the gateway answers for `/plugin`. */
export const redirect: Respond = (response) => {
  response.writeHead(302, { Location: `/mock/${GENERATION_ID}/download` });
  response.end();
};

export const noAnswer: Respond = () => undefined;

// The base URL is cached for the process; left set, every later suite would call this closed server.
const forgetBaseUrl = () => {
  (envInfo.constructor as unknown as { cachedBaseUrl?: string }).cachedBaseUrl = undefined;
};

/**
 * The `/mock` endpoint the CLI is built against, answered on the loopback: the three routes and
 * nothing else, so a request to any other path is a 404 and fails the test that sent it.
 */
export class StubGenerationEndpoint {
  public generate: Respond = bare(404);
  public status: Respond = bare(404);
  public download: Respond = bare(404);
  public readonly generateRequests: ReceivedRequest[] = [];
  public readonly statusRequests: ReceivedRequest[] = [];
  public readonly downloadRequests: ReceivedRequest[] = [];

  private constructor(private readonly server: http.Server) {}

  public static async start(): Promise<StubGenerationEndpoint> {
    const server = http.createServer();
    const endpoint = new StubGenerationEndpoint(server);
    server.on('request', (request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        const url = request.url ?? '';
        const received = { url, headers: request.headers, body: Buffer.concat(chunks).toString() };
        const route = `${request.method} ${url.split('?')[0]}`;
        if (route === 'POST /mock') {
          endpoint.generateRequests.push(received);
          endpoint.generate(response, endpoint.generateRequests.length);
        } else if (route === `GET /mock/${GENERATION_ID}/status`) {
          endpoint.statusRequests.push(received);
          endpoint.status(response, endpoint.statusRequests.length);
        } else if (route === `GET /mock/${GENERATION_ID}/download`) {
          endpoint.downloadRequests.push(received);
          endpoint.download(response, endpoint.downloadRequests.length);
        } else {
          bare(404)(response, 0);
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    forgetBaseUrl();
    process.env.APIMATIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return endpoint;
  }

  /** A run that succeeds at once and downloads `content`; a test changes the one route it is about. */
  public reset(content: Buffer = Buffer.from('PK stub-files')) {
    this.generateRequests.length = 0;
    this.statusRequests.length = 0;
    this.downloadRequests.length = 0;
    this.generate = json(202, { id: GENERATION_ID });
    this.status = redirect;
    this.download = zip(content);
  }

  public async stop() {
    delete process.env.APIMATIC_BASE_URL;
    forgetBaseUrl();
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => this.server.close((error) => (error ? reject(error) : resolve())));
  }
}
