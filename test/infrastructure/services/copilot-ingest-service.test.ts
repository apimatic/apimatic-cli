import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { stripVTControlCharacters } from 'node:util';
import { Buffer } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
import nock from 'nock';
import { expect } from 'chai';
import { CopilotIngestService } from '../../../src/infrastructure/services/copilot-ingest-service';
import { ServiceErrorCode } from '../../../src/infrastructure/service-error';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { CopilotBundle } from '../../../src/types/portal/copilot/copilot-bundle';

const API_URL = 'http://copilot.test';
const COPILOT = { key: 'pk_test', apiUrl: API_URL };
const VERSION_ID = 'v-1';

const bundle = CopilotBundle.of(
  [{ path: '/', title: 'Home', description: null, markdown: '# Home' }],
  null,
  '1.0.0',
  new Date('2026-10-14T00:00:00.000Z')
);

const statusBody = (status: string, extra: Record<string, unknown> = {}) => ({
  versionId: VERSION_ID,
  status,
  pageCount: 12,
  changedPages: 3,
  removedPages: 1,
  chunkCount: 40,
  error: null,
  ...extra
});

/** A port nothing listens on, so a connection to it is refused. */
const closedPort = async (): Promise<number> => {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
};

describe('CopilotIngestService', () => {
  let configRoot: string;
  let configDir: DirectoryPath;
  const service = new CopilotIngestService({ pollIntervalMs: 1, indexTimeoutMs: 5000 });

  const upload = (authKey: string | null = 'auth-key') => service.upload(COPILOT, bundle, configDir, 'bash', authKey);
  const awaitIndexing = () => service.awaitIndexing(COPILOT, VERSION_ID, configDir, 'bash', 'auth-key');

  beforeEach(() => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-ingest-'));
    configDir = new DirectoryPath(configRoot);
    nock.cleanAll();
  });

  afterEach(() => {
    fs.rmSync(configRoot, { recursive: true, force: true });
    nock.cleanAll();
  });

  describe('upload', () => {
    it('posts the gzipped bundle with both keys and answers with the queued version', async () => {
      let posted: unknown;
      const scope = nock(API_URL, {
        reqheaders: {
          authorization: 'X-Auth-Key auth-key',
          'x-copilot-key': 'pk_test',
          'content-type': 'application/gzip'
        }
      })
        .post('/v1/ingest', (body: string) => {
          posted = JSON.parse(gunzipSync(Buffer.from(body, 'hex')).toString('utf8'));
          return true;
        })
        .reply(202, { versionId: VERSION_ID, status: 'queued', pageCount: 1 });

      const result = await upload();

      expect(result._unsafeUnwrap()).to.deep.equal({ versionId: VERSION_ID, status: 'queued', pageCount: 1 });
      expect(posted).to.deep.equal(bundle.toJSON());
      expect(scope.isDone()).to.be.true;
    });

    it('uses the stored key when no flag overrides it', async () => {
      fs.writeFileSync(path.join(configRoot, 'config.json'), JSON.stringify({ email: 'a@b.c', authKey: 'stored' }));
      nock(API_URL, { reqheaders: { authorization: 'X-Auth-Key stored' } })
        .post('/v1/ingest')
        .reply(200, { versionId: VERSION_ID, status: 'unchanged', pageCount: 1 });

      expect((await upload(null))._unsafeUnwrap().status).to.equal('unchanged');
    });

    it('asks the user to sign in, without a request, when there is no key', async () => {
      const result = await upload(null);

      expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.UnAuthorized);
      expect(stripVTControlCharacters(result._unsafeUnwrapErr().errorMessage)).to.contain('apimatic auth login');
    });

    it("surfaces the service's message for a refused upload", async () => {
      nock(API_URL)
        .post('/v1/ingest')
        .reply(403, { code: 'sync_forbidden', message: 'This key cannot sync this portal.' });

      const error = (await upload())._unsafeUnwrapErr();

      expect(error.code).to.equal(ServiceErrorCode.Forbidden);
      expect(error.errorMessage).to.equal('This key cannot sync this portal.');
    });

    it('surfaces the message of a bundle that is invalid or too large', async () => {
      nock(API_URL).post('/v1/ingest').reply(413, { code: 'too_large', message: 'The bundle is over 50 MB.' });

      expect((await upload())._unsafeUnwrapErr().errorMessage).to.equal('The bundle is over 50 MB.');
    });

    it('reports a service that cannot be reached as a network error', async () => {
      const unreachable = { ...COPILOT, apiUrl: `http://127.0.0.1:${await closedPort()}` };

      const result = await service.upload(unreachable, bundle, configDir, 'bash', 'auth-key');

      expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.NetworkError);
    });
  });

  describe('awaitIndexing', () => {
    it('polls until the version is active', async () => {
      const scope = nock(API_URL, { reqheaders: { 'x-copilot-key': 'pk_test' } })
        .get(`/v1/ingest/${VERSION_ID}`)
        .reply(200, statusBody('queued'))
        .get(`/v1/ingest/${VERSION_ID}`)
        .reply(200, statusBody('building'))
        .get(`/v1/ingest/${VERSION_ID}`)
        .reply(200, statusBody('active'));

      const result = await awaitIndexing();

      expect(result._unsafeUnwrap()).to.deep.include({ status: 'active', pageCount: 12, changedPages: 3 });
      expect(scope.isDone()).to.be.true;
    });

    it('ends on a version a newer sync superseded', async () => {
      nock(API_URL).get(`/v1/ingest/${VERSION_ID}`).reply(200, statusBody('superseded'));

      expect((await awaitIndexing())._unsafeUnwrap().status).to.equal('superseded');
    });

    it("fails with the service's reason when indexing failed", async () => {
      nock(API_URL)
        .get(`/v1/ingest/${VERSION_ID}`)
        .reply(200, statusBody('failed', { error: 'Embedding provider unavailable.' }));

      expect((await awaitIndexing())._unsafeUnwrapErr().errorMessage).to.equal('Embedding provider unavailable.');
    });

    it('times out on a version that never finishes', async () => {
      nock(API_URL).get(`/v1/ingest/${VERSION_ID}`).times(1000).reply(200, statusBody('building'));
      const impatient = new CopilotIngestService({ pollIntervalMs: 1, indexTimeoutMs: 20 });

      const result = await impatient.awaitIndexing(COPILOT, VERSION_ID, configDir, 'bash', 'auth-key');

      expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.Timeout);
    });

    it('refuses a status body it cannot read', async () => {
      nock(API_URL).get(`/v1/ingest/${VERSION_ID}`).reply(200, { status: 'done' });

      expect((await awaitIndexing())._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.InvalidResponse);
    });
  });
});
