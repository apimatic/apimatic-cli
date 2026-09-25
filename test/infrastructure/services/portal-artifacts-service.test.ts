import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { PortalArtifactsService } from '../../../src/infrastructure/services/portal-artifacts-service';
import { ServiceError, ServiceErrorCode } from '../../../src/infrastructure/service-error';
import { ZipService } from '../../../src/infrastructure/zip-service';
import { envInfo } from '../../../src/infrastructure/env-info';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { Endpoint } from '../../../src/types/portal/endpoint';

const GENERATION_ID = '11111111-2222-3333-4444-555555555555';
const AUTH_KEY = 'test-auth-key';
const metadata = { commandName: 'portal generate', shell: 'bash' };

const CATALOG = {
  paths: { '/payments': { get: { 'sample-a': 'client.payments.list()' } } }
};

describe('PortalArtifactsService', () => {
  let server: http.Server;
  let workDir: string;
  let buildDirectory: DirectoryPath;
  let configDir: DirectoryPath;
  let service: PortalArtifactsService;

  /** What the endpoint will answer the download with, built fresh per test. */
  let artifactsZip: Buffer;
  let respondToStatus: (res: http.ServerResponse) => void;
  let postedBodyBytes: number;

  const json = (res: http.ServerResponse, statusCode: number, body: unknown) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const statusBody = (body: unknown) => (res: http.ServerResponse) => json(res, 200, body);

  /** Lays a artifactsZip out on disk exactly as the endpoint does, then zips it. */
  const artifactsZipOf = async (entries: Record<string, string>): Promise<Buffer> => {
    const staging = path.join(workDir, `artifacts-${Math.random().toString(36).slice(2)}`);
    for (const [entry, contents] of Object.entries(entries)) {
      const file = path.join(staging, entry);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }
    fs.mkdirSync(staging, { recursive: true });

    const zipPath = new FilePath(new DirectoryPath(workDir), new FileName(`${path.basename(staging)}.zip`));
    await new ZipService().archive(new DirectoryPath(staging), zipPath);
    return fs.readFileSync(zipPath.toString());
  };

  const generate = async (into?: string) => {
    const destination = into ?? fs.mkdtempSync(path.join(workDir, 'into-'));
    return await service.generate(buildDirectory, new DirectoryPath(destination), configDir, metadata, AUTH_KEY);
  };

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
        res.end(artifactsZip);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    process.env.APIMATIC_BASE_URL = `http://127.0.0.1:${port}`;

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-artifacts-'));

    // The build directory the service zips and uploads.
    const buildDir = path.join(workDir, 'src');
    fs.mkdirSync(path.join(buildDir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'apimatic.json'), JSON.stringify({ schemaVersion: 1 }));
    fs.writeFileSync(path.join(buildDir, 'spec', 'openapi.json'), '{}');
    buildDirectory = new DirectoryPath(buildDir);

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

  beforeEach(async () => {
    respondToStatus = statusBody({ status: 'Completed' });
    artifactsZip = await artifactsZipOf({});
  });

  describe('a run that delivers everything', () => {
    beforeEach(async () => {
      artifactsZip = await artifactsZipOf({
        'sdk/csharp.zip': 'PK csharp-sdk',
        'sdk/typescript.zip': 'PK typescript-sdk',
        'code-samples/csharp.json': JSON.stringify(CATALOG),
        'plugin.zip': 'PK plugin'
      });
    });

    it('reads a catalog per language into the samples the build merges', async () => {
      const artifacts = (await generate())._unsafeUnwrap();

      const samples = artifacts.codeSampleCatalogs.samplesFor(new Endpoint('GET', '/payments'));
      expect(samples.map((sample) => sample.lang)).to.deep.equal(['csharp']);
    });

    // Keyed by the delivered name rather than parsed, so placement is a copy under the same name.
    it('names each SDK by the file it arrived as', async () => {
      const artifacts = (await generate())._unsafeUnwrap();

      expect([...artifacts.sdks.keys()].sort()).to.deep.equal(['csharp', 'typescript']);
      expect(fs.readFileSync(artifacts.sdks.get('csharp')!.toString(), 'utf8')).to.equal('PK csharp-sdk');
    });

    it('hands back the plugin archive', async () => {
      const artifacts = (await generate())._unsafeUnwrap();

      expect(artifacts.plugin).to.not.be.undefined;
      expect(fs.readFileSync(artifacts.plugin!.toString(), 'utf8')).to.equal('PK plugin');
    });

    it('unpacks into the directory it was given, and nowhere else', async () => {
      const into = fs.mkdtempSync(path.join(workDir, 'into-'));

      const artifacts = (await generate(into))._unsafeUnwrap();

      expect(artifacts.plugin!.toString()).to.have.string(into);
    });
  });

  // A portal that declares no languages and no plugin is a valid run. It must not look like a
  // failure, or a docs-only portal could never be built.
  describe('a run that delivers nothing', () => {
    it('succeeds with no samples, no SDKs and no plugin', async () => {
      const artifacts = (await generate())._unsafeUnwrap();

      expect(artifacts.codeSampleCatalogs.samplesFor(new Endpoint('GET', '/payments'))).to.be.empty;
      expect(artifacts.sdks.size).to.equal(0);
      expect(artifacts.plugin).to.be.undefined;
    });
  });

  // How a finished run actually reports itself: the gateway redirects the status to the download
  // rather than answering `Completed`, the same as it does for plugin generation. Read against the
  // deployed service, which never sends a status body saying the run is done.
  describe('a run the gateway reports by redirecting', () => {
    beforeEach(async () => {
      artifactsZip = await artifactsZipOf({ 'sdk/typescript.zip': 'PK typescript-sdk', 'plugin.zip': 'PK plugin' });
      respondToStatus = (res) => {
        res.writeHead(302, { Location: `/portal-artifacts/${GENERATION_ID}/download` });
        res.end();
      };
    });

    it('takes the redirect as the run having finished, and downloads', async () => {
      const artifacts = (await generate())._unsafeUnwrap();

      expect([...artifacts.sdks.keys()]).to.deep.equal(['typescript']);
      expect(artifacts.plugin).to.not.be.undefined;
    });
  });

  it('uploads the build directory', async () => {
    await generate();

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

      const error = (
        await impatient.generate(
          buildDirectory,
          new DirectoryPath(fs.mkdtempSync(path.join(workDir, 'into-'))),
          configDir,
          metadata,
          AUTH_KEY
        )
      )._unsafeUnwrapErr();

      expect(error.code).to.equal(ServiceErrorCode.Timeout);
      expect(error.errorMessage).to.contain('Portal artifacts generation timed out');
    });

    it('refuses a catalog for a language it cannot read, rather than leaving it out', async () => {
      artifactsZip = await artifactsZipOf({ 'code-samples/cobol.json': JSON.stringify(CATALOG) });

      expect((await generate())._unsafeUnwrapErr()).to.equal(ServiceError.InvalidResponse);
    });

    it('refuses a catalog that is not a catalog', async () => {
      artifactsZip = await artifactsZipOf({ 'code-samples/csharp.json': '{ not json' });

      expect((await generate())._unsafeUnwrapErr()).to.equal(ServiceError.InvalidResponse);
    });
  });

  it('asks for an auth key it does not have rather than calling without one', async () => {
    const error = (
      await service.generate(
        buildDirectory,
        new DirectoryPath(fs.mkdtempSync(path.join(workDir, 'into-'))),
        configDir,
        metadata,
        null
      )
    )._unsafeUnwrapErr();

    expect(error.code).to.equal(ServiceErrorCode.UnAuthorized);
  });
});
