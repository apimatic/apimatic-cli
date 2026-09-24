import { expect } from 'chai';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { Status } from '@apimatic/sdk';
import { SdkGenerationService } from '../../../src/infrastructure/services/sdk-generation-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FilePath } from '../../../src/types/file/filePath';
import { Language, Stability } from '../../../src/types/sdk/generate';
import { ServiceError, ServiceErrorCode } from '../../../src/infrastructure/service-error';
import { envInfo } from '../../../src/infrastructure/env-info';

describe('SdkGenerationService generation status polling', () => {
  const GENERATION_ID = '11111111-2222-3333-4444-555555555555';
  const AUTH_KEY = 'test-auth-key';
  const metadata = { commandName: 'portal generate', shell: 'bash' };

  let server: http.Server;
  let workDir: string;
  let buildPath: FilePath;
  let configDir: DirectoryPath;
  let service: SdkGenerationService;
  let respondToStatus: (res: http.ServerResponse, attempt: number) => void;
  const statusRequests: { url: string; headers: http.IncomingHttpHeaders }[] = [];

  const json = (res: http.ServerResponse, statusCode: number, body: unknown) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  // The API redirects to the download location on completion rather than
  // reporting a Completed status body.
  const redirectToDownload = (res: http.ServerResponse) => {
    res.writeHead(302, { Location: `/${GENERATION_ID}/download` });
    res.end();
  };

  const statusBody = (body: unknown) => (res: http.ServerResponse) => json(res, 200, body);

  const drain = async (stream: NodeJS.ReadableStream) => {
    let size = 0;
    for await (const chunk of stream) size += chunk.length;
    return size;
  };

  before(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '';

      if (req.method === 'POST') {
        req.resume();
        req.on('end', () =>
          json(res, 202, {
            id: GENERATION_ID,
            links: {
              status: `${url}/${GENERATION_ID}/status`,
              download: `${url}/${GENERATION_ID}/download`
            }
          })
        );
        return;
      }

      if (url.endsWith('/status')) {
        statusRequests.push({ url, headers: req.headers });
        respondToStatus(res, statusRequests.length);
        return;
      }

      if (url.endsWith('/download')) {
        res.writeHead(200, { 'Content-Type': 'application/zip' });
        res.end(Buffer.from('PK generated-artifact'));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    process.env.APIMATIC_BASE_URL = `http://127.0.0.1:${port}`;

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-service-'));
    const buildFile = path.join(workDir, 'build.zip');
    fs.writeFileSync(buildFile, Buffer.from('PK build-input'));
    buildPath = FilePath.create(buildFile)!;
    // No config.json here, so the explicit authKey is used.
    configDir = new DirectoryPath(workDir);
    // Near-zero poll interval so the suite is not paced by the 3s production default.
    service = new SdkGenerationService({ pollIntervalMs: 1 });
  });

  after(async () => {
    delete process.env.APIMATIC_BASE_URL;
    (envInfo.constructor as unknown as { cachedBaseUrl?: string }).cachedBaseUrl = undefined;
    fs.rmSync(workDir, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    statusRequests.length = 0;
  });

  const errorFrom = (result: { _unsafeUnwrapErr(): unknown }) => result._unsafeUnwrapErr() as ServiceError;

  describe('generateSdk', () => {
    const generateSdk = () => service.generateSdk(buildPath, Language.TYPESCRIPT, Stability.BETA, configDir, metadata, AUTH_KEY);

    it('polls the v4 status path and downloads once complete', async () => {
      respondToStatus = (res) => redirectToDownload(res);

      const result = await generateSdk();

      expect(result.isOk(), 'generation should succeed').to.be.true;
      expect(await drain(result._unsafeUnwrap())).to.be.greaterThan(0);
      expect(statusRequests.map((request) => request.url)).to.deep.equal([`/sdk/v2/${GENERATION_ID}/status`]);
    });

    it('passes through the HTML sdk generation embeds in messages', async () => {
      const message =
        'Main API definition file could not be identified as provided file(s) are either invalid or are in an ' +
        'unrecognized/unsupported format.  (<a href="https://docs.apimatic.io/rulesets/input-file-validation/' +
        'main-file-known-format" target="_blank" rel="nofollow">View Details</a>)<br/><b>Error</b>: ' +
        '<i><code>Directory does not contain any valid API description file.</code></i>. ';
      respondToStatus = statusBody({ status: Status.ValidationError, errors: { importSummary: [message] } });

      const result = await generateSdk();

      expect(errorFrom(result).errorMessage).to.equal('One or more validation errors occurred.\n- ' + message);
    });
  });
  // The timeout message names the flow it came from, so its wiring is pinned here.
  // Before the shared poller this polled a stuck generation forever.
  describe('giving up on a generation that never finishes', () => {
    const impatient = () => new SdkGenerationService({ pollIntervalMs: 1, generationTimeoutMs: 15 });

    beforeEach(() => {
      respondToStatus = statusBody({ status: Status.InProgress });
    });

    it('bounds sdk generation', async () => {
      const result = await impatient().generateSdk(buildPath, Language.TYPESCRIPT, Stability.BETA, configDir, metadata, AUTH_KEY);

      expect(errorFrom(result).code).to.equal(ServiceErrorCode.Timeout);
      expect(errorFrom(result).errorMessage).to.equal('SDK generation timed out.');
    });

    it('gives up on a status request that never answers', async () => {
      // The budget above is only read once a status call returns, so it cannot end a run
      // whose poll hangs. Only the request timeout can, which is why one is set.
      respondToStatus = () => {};

      const bounded = new SdkGenerationService({ pollIntervalMs: 1, generationTimeoutMs: 5_000, requestTimeoutMs: 30 });

      const result = await bounded.generateSdk(buildPath, Language.TYPESCRIPT, Stability.BETA, configDir, metadata, AUTH_KEY);

      expect(errorFrom(result).code).to.equal(ServiceErrorCode.NetworkError);
    });
  });
});
