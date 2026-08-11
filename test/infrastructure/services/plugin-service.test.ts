import { expect } from 'chai';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { PluginService } from '../../../src/infrastructure/services/plugin-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FilePath } from '../../../src/types/file/filePath';
import { ServiceError, ServiceErrorCode } from '../../../src/infrastructure/service-error';
import { envInfo } from '../../../src/infrastructure/env-info';

describe('PluginService', () => {
  const GENERATION_ID = '019fdbef-91d5-7a1f-81c2-866af5d76fe9';
  const AUTH_KEY = 'test-auth-key';
  const metadata = { commandName: 'plugin generate', shell: 'bash' };

  let server: http.Server;
  let workDir: string;
  let buildPath: FilePath;
  let configDir: DirectoryPath;
  let service: PluginService;

  let respondToGenerate: (res: http.ServerResponse) => void;
  let respondToStatus: (res: http.ServerResponse, attempt: number) => void;
  let respondToDownload: (res: http.ServerResponse) => void;

  const generateRequests: { url: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  const statusRequests: { url: string; headers: http.IncomingHttpHeaders }[] = [];

  const json = (res: http.ServerResponse, statusCode: number, body: unknown) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const problem = (res: http.ServerResponse, statusCode: number, body: unknown) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/problem+json' });
    res.end(JSON.stringify(body));
  };

  const statusBody = (body: unknown) => (res: http.ServerResponse) => json(res, 200, body);

  const drain = async (stream: NodeJS.ReadableStream) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString();
  };

  const clearBaseUrlCache = () => {
    (envInfo.constructor as unknown as { cachedBaseUrl?: string }).cachedBaseUrl = undefined;
  };

  before(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '';

      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => {
          generateRequests.push({ url, headers: req.headers, body: Buffer.concat(chunks).toString() });
          respondToGenerate(res);
        });
        return;
      }

      if (url.endsWith('/status')) {
        statusRequests.push({ url, headers: req.headers });
        respondToStatus(res, statusRequests.length);
        return;
      }

      if (url.endsWith('/download')) {
        respondToDownload(res);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    clearBaseUrlCache();
    process.env.APIMATIC_BASE_URL = `http://127.0.0.1:${port}`;

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-service-'));
    const buildFile = path.join(workDir, 'build.zip');
    fs.writeFileSync(buildFile, Buffer.from('PK build-input'));
    buildPath = FilePath.create(buildFile)!;
    // No config.json here, so the explicit authKey is used.
    configDir = new DirectoryPath(workDir);
    // Near-zero interval and budget so the suite is not paced by the production 3s / 5min.
    service = new PluginService(1, 5000);
  });

  after(async () => {
    delete process.env.APIMATIC_BASE_URL;
    // Static cache — leaving it set would point every later suite at this closed server.
    clearBaseUrlCache();
    fs.rmSync(workDir, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    generateRequests.length = 0;
    statusRequests.length = 0;
    respondToGenerate = (res) => json(res, 202, { id: GENERATION_ID });
    respondToStatus = statusBody({ status: 'Completed' });
    respondToDownload = (res) => {
      res.writeHead(200, { 'Content-Type': 'application/zip' });
      res.end(Buffer.from('PK context-plugin'));
    };
  });

  const generatePlugin = (authKey: string | null = AUTH_KEY) =>
    service.generatePlugin(buildPath, configDir, metadata, authKey);
  const errorFrom = (result: { _unsafeUnwrapErr(): unknown }) => result._unsafeUnwrapErr() as ServiceError;

  describe('generatePlugin', () => {
    it('uploads the build, polls the plugin status path and downloads once complete', async () => {
      const result = await generatePlugin();

      expect(result.isOk()).to.be.true;
      expect(await drain(result._unsafeUnwrap())).to.equal('PK context-plugin');
      expect(generateRequests).to.have.length(1);
      expect(statusRequests[0].url).to.equal(`/plugin/${GENERATION_ID}/status`);
    });

    it('sends the build as a multipart file part, authenticated, tagged with the command origin', async () => {
      await generatePlugin();

      const request = generateRequests[0];
      expect(request.url).to.equal('/plugin?origin=APIMATIC+CLI+plugin+generate');
      expect(request.headers.authorization).to.equal(`X-Auth-Key ${AUTH_KEY}`);
      expect(request.headers['content-type']).to.match(/^multipart\/form-data; boundary=/);
      expect(request.body).to.include('name="file"');
      expect(request.body).to.include('PK build-input');
    });

    it('authenticates the status and download calls too', async () => {
      await generatePlugin();

      expect(statusRequests[0].headers.authorization).to.equal(`X-Auth-Key ${AUTH_KEY}`);
    });

    it('keeps polling through every in-flight status', async () => {
      const inFlight = ['Queued', 'ExecutionStarted', 'GeneratingArtifacts'];
      respondToStatus = (res, attempt) => json(res, 200, { status: inFlight[attempt - 1] ?? 'Completed' });

      const result = await generatePlugin();

      expect(result.isOk()).to.be.true;
      expect(statusRequests).to.have.length(4);
    });

    it('refuses to call the API at all without a key', async () => {
      const result = await generatePlugin(null);

      expect(errorFrom(result).code).to.equal(ServiceErrorCode.UnAuthorized);
      expect(generateRequests).to.have.length(0);
    });
  });

  describe('validation failures', () => {
    it('keeps the plugin-config errors addressable by key and lists every message', async () => {
      respondToStatus = statusBody({
        status: 'ValidationError',
        errors: { pluginConfig: ["'pluginId' must be lower-case kebab-case.", "'author.email' must be an email."] }
      });

      const error = errorFrom(await generatePlugin());

      expect(error.code).to.equal(ServiceErrorCode.BadRequest);
      expect(error.getError('pluginConfig')).to.have.length(2);
      expect(error.errorMessage).to.include("'pluginId' must be lower-case kebab-case.");
      expect(error.errorMessage).to.include("'author.email' must be an email.");
    });

    it('keeps the sdkRepos errors addressable by key', async () => {
      respondToStatus = statusBody({
        status: 'ValidationError',
        errors: { sdkRepos: ['no language in sdkRepos can be built by this generator'] }
      });

      const error = errorFrom(await generatePlugin());

      expect(error.getError('sdkRepos')).to.deep.equal(['no language in sdkRepos can be built by this generator']);
    });

    it('terminates on a validation error that carries no messages', async () => {
      respondToStatus = statusBody({ status: 'ValidationError' });

      const error = errorFrom(await generatePlugin());

      expect(error.errorMessage).to.equal('One or more validation errors occurred.');
    });

    it('maps a Failed status onto a server error', async () => {
      respondToStatus = statusBody({ status: 'Failed' });

      expect(errorFrom(await generatePlugin()).code).to.equal(ServiceErrorCode.ServerError);
    });

    it('keeps polling through an Unknown status', async () => {
      // The orchestrator reports Unknown until it writes its first custom status, so a run
      // polled in that window is healthy rather than broken.
      respondToStatus = (res, attempt) => json(res, 200, { status: attempt === 1 ? 'Unknown' : 'Completed' });

      const result = await generatePlugin();

      expect(result.isOk()).to.be.true;
      expect(statusRequests).to.have.length(2);
    });

    it('gives up once the generation budget is spent', async () => {
      const impatient = new PluginService(1, 15);
      respondToStatus = statusBody({ status: 'GeneratingArtifacts' });

      const result = await impatient.generatePlugin(buildPath, configDir, metadata, AUTH_KEY);

      expect(errorFrom(result).code).to.equal(ServiceErrorCode.Timeout);
      expect(errorFrom(result).errorMessage).to.equal('Plugin generation timed out.');
    });

    it('gives up on a status request that never answers', async () => {
      // Without a request timeout this hangs rather than fails: the generation budget is
      // only read once a status call returns, and this one never does.
      const impatient = new PluginService(1, 5_000, 30);
      respondToStatus = () => {};

      const result = await impatient.generatePlugin(buildPath, configDir, metadata, AUTH_KEY);

      expect(errorFrom(result).code).to.equal(ServiceErrorCode.NetworkError);
    });

    it('reads one last status before declaring a timeout', async () => {
      // The budget is spent during the wait, but the run finished in that window.
      const impatient = new PluginService(20, 10);
      respondToStatus = statusBody({ status: 'Completed' });

      const result = await impatient.generatePlugin(buildPath, configDir, metadata, AUTH_KEY);

      expect(result.isOk()).to.be.true;
    });
  });

  describe('request errors', () => {
    it('surfaces the invalid-zip 400 that io originates', async () => {
      respondToGenerate = (res) =>
        problem(res, 400, {
          title: 'One or more validation errors occurred.',
          detail: 'The provided build file is not a valid zip archive.',
          errors: { file: ['build file should be in valid zip format'] }
        });

      const error = errorFrom(await generatePlugin());

      expect(error.code).to.equal(ServiceErrorCode.BadRequest);
      expect(error.errorMessage).to.equal(
        'One or more validation errors occurred.\n- build file should be in valid zip format'
      );
    });

    it('surfaces the entitlement 403 that io originates', async () => {
      respondToGenerate = (res) =>
        problem(res, 403, {
          title: 'Access denied to resource.',
          errors: { '': ['Context plugin generation is not allowed on your subscription'] }
        });

      const error = errorFrom(await generatePlugin());

      expect(error.code).to.equal(ServiceErrorCode.Forbidden);
      expect(error.errorMessage).to.equal(
        'Access denied to resource.\n- Context plugin generation is not allowed on your subscription'
      );
    });

    it('falls back to detail when a problem body carries no errors map', async () => {
      respondToGenerate = (res) =>
        problem(res, 400, { title: 'One or more validation errors occurred.', detail: "Plugin id 'x' not found" });

      expect(errorFrom(await generatePlugin()).errorMessage).to.equal(
        "One or more validation errors occurred.\n- Plugin id 'x' not found"
      );
    });

    it('points an expired key at the login command', async () => {
      respondToGenerate = (res) => {
        res.writeHead(401);
        res.end();
      };

      const error = errorFrom(await generatePlugin());

      expect(error.code).to.equal(ServiceErrorCode.UnAuthorized);
      // A bare 401 carries no body, so the remedy can only come from the CLI.
      expect(error.errorMessage).to.equal(ServiceError.unauthorizedWithHint(null).errorMessage);
    });

    it('points an expired key at the login command when the download 401s', async () => {
      respondToDownload = (res) => {
        res.writeHead(401);
        res.end();
      };

      const error = errorFrom(await generatePlugin());

      expect(error.code).to.equal(ServiceErrorCode.UnAuthorized);
      expect(error.errorMessage).to.equal(ServiceError.unauthorizedWithHint(null).errorMessage);
    });

    it('reports a generate response that carries no id', async () => {
      respondToGenerate = (res) => json(res, 202, {});

      expect(errorFrom(await generatePlugin()).code).to.equal(ServiceErrorCode.InvalidResponse);
    });

    it('stops polling when the generation id is unknown', async () => {
      respondToStatus = (res) => {
        res.writeHead(404);
        res.end();
      };

      expect(errorFrom(await generatePlugin()).code).to.equal(ServiceErrorCode.NotFound);
      expect(statusRequests).to.have.length(1);
    });

    it('reports a failed download without hanging on its body', async () => {
      respondToDownload = (res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ title: 'boom' }));
      };

      expect(errorFrom(await generatePlugin()).code).to.equal(ServiceErrorCode.ServerError);
    });
  });
});
