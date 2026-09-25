import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { Buffer } from 'node:buffer';
import { buffer } from 'node:stream/consumers';
import { expect } from 'chai';
import { PortalArtifactsService } from '../../../src/infrastructure/services/portal-artifacts-service';
import { ServiceErrorCode } from '../../../src/infrastructure/service-error';
import { ZipService } from '../../../src/infrastructure/zip-service';
import { envInfo } from '../../../src/infrastructure/env-info';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';

const GENERATION_ID = '11111111-2222-3333-4444-555555555555';
const AUTH_KEY = 'test-auth-key';
const metadata = { commandName: 'portal generate', shell: 'bash' };

/** What the endpoint answers the download with; the service hands it on without reading it. */
const ARTIFACTS_ZIP = Buffer.from('PK portal artifacts');

describe('PortalArtifactsService', () => {
  let server: http.Server;
  let workDir: string;
  let build: FilePath;
  let configDir: DirectoryPath;
  let service: PortalArtifactsService;

  let respondToStatus: (res: http.ServerResponse) => void;
  let postedBodyBytes: number;

  const json = (res: http.ServerResponse, statusCode: number, body: unknown) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const statusBody = (body: unknown) => (res: http.ServerResponse) => json(res, 200, body);

  const generate = async () => await service.generate(build, configDir, metadata, AUTH_KEY);

  before(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '';

      if (req.method === 'POST') {
        postedBodyBytes = 0;
        req.on('data', (chunk: Buffer) => (postedBodyBytes += chunk.length));
        req.on('end', () => json(res, 202, { id: GENERATION_ID }));
        return;
      }

      if (url.endsWith('/status')) {
        respondToStatus(res);
        return;
      }

      if (url.endsWith('/download')) {
        res.writeHead(200, { 'Content-Type': 'application/zip' });
        res.end(ARTIFACTS_ZIP);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    process.env.APIMATIC_BASE_URL = `http://127.0.0.1:${port}`;

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-artifacts-'));

    // The zipped source directory the service uploads.
    const sourceDir = path.join(workDir, 'src');
    fs.mkdirSync(path.join(sourceDir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'apimatic.json'), JSON.stringify({ schemaVersion: 1 }));
    fs.writeFileSync(path.join(sourceDir, 'spec', 'openapi.json'), '{}');
    build = new FilePath(new DirectoryPath(workDir), new FileName('build.zip'));
    await new ZipService().archive(new DirectoryPath(sourceDir), build);

    // No config.json here, so the explicit authKey is used.
    configDir = new DirectoryPath(workDir);
    // Near-zero poll interval so the suite is not paced by the 3s production default.
    service = new PortalArtifactsService({ pollIntervalMs: 1 });
  });

  after(async () => {
    delete process.env.APIMATIC_BASE_URL;
    (envInfo.constructor as unknown as { cachedBaseUrl?: string }).cachedBaseUrl = undefined;
    fs.rmSync(workDir, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    respondToStatus = statusBody({ status: 'Completed' });
  });

  it('hands back the zip exactly as the endpoint delivered it', async () => {
    const zip = (await generate())._unsafeUnwrap();

    expect(await buffer(zip)).to.deep.equal(ARTIFACTS_ZIP);
  });

  // How a finished run actually reports itself: the gateway redirects the status to the download
  // rather than answering `Completed`, the same as it does for plugin generation. Read against the
  // deployed service, which never sends a status body saying the run is done.
  it('takes a redirect from the status as the run having finished, and downloads', async () => {
    respondToStatus = (res) => {
      res.writeHead(302, { Location: `/portal-artifacts/${GENERATION_ID}/download` });
      res.end();
    };

    const zip = (await generate())._unsafeUnwrap();

    expect(await buffer(zip)).to.deep.equal(ARTIFACTS_ZIP);
  });

  it('uploads the build it was given', async () => {
    await buffer((await generate())._unsafeUnwrap());

    // The zip carries the two files written above, so a body this size cannot be an empty archive.
    expect(postedBodyBytes).to.be.greaterThan(100);
  });

  describe('a run that fails', () => {
    // All or nothing, and every reason at once: the user learns that two things went wrong.
    it('names every failed language and the plugin', async () => {
      respondToStatus = statusBody({
        status: 'ValidationError',
        errors: { csharp: ['SDK generation failed'], plugin: ['skills generation failed'] }
      });

      const error = (await generate())._unsafeUnwrapErr();

      expect(error.errorMessage).to.contain('csharp: SDK generation failed');
      expect(error.errorMessage).to.contain('plugin: skills generation failed');
    });

    it('reports a subscription refusal as denied access', async () => {
      respondToStatus = statusBody({
        status: 'SubscriptionError',
        errors: { plugin: ['The context plugin is not allowed on your subscription'] }
      });

      const error = (await generate())._unsafeUnwrapErr();

      expect(error.code).to.equal(ServiceErrorCode.Forbidden);
      expect(error.errorMessage).to.contain('not allowed on your subscription');
    });

    it('bounds a generation that never finishes', async () => {
      respondToStatus = statusBody({ status: 'GeneratingArtifacts' });
      const impatient = new PortalArtifactsService({ pollIntervalMs: 1, generationTimeoutMs: 15 });

      const error = (await impatient.generate(build, configDir, metadata, AUTH_KEY))._unsafeUnwrapErr();

      expect(error.code).to.equal(ServiceErrorCode.Timeout);
      expect(error.errorMessage).to.contain('Portal artifacts generation timed out');
    });
  });

  it('asks for an auth key it does not have rather than calling without one', async () => {
    const error = (await service.generate(build, configDir, metadata, null))._unsafeUnwrapErr();

    expect(error.code).to.equal(ServiceErrorCode.UnAuthorized);
  });
});
