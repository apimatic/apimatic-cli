import { Buffer } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
import nock from 'nock';
import { expect } from 'chai';
import { CopilotIngestService } from '../../../src/infrastructure/services/copilot-ingest-service';
import { ServiceErrorCode } from '../../../src/infrastructure/service-error';
import { CopilotBundle } from '../../../src/types/portal/copilot/copilot-bundle';
import { ServiceAddress } from '../../../src/types/portal/config/service-address';
import { closedPort } from '../../helpers/network';

const API_URL = 'http://localhost:8787';
const at = (url: string) => ServiceAddress.parse(url, 'apiUrl')._unsafeUnwrap();
const COPILOT = { key: 'pk_test', address: at(API_URL) };
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

describe('CopilotIngestService', () => {
  const service = new CopilotIngestService({ pollIntervalMs: 1, indexTimeoutMs: 5000 });

  const upload = () => service.upload(COPILOT, bundle, 'bash', 'auth-key');
  const awaitIndexing = () => service.awaitIndexing(COPILOT, VERSION_ID, 'bash', 'auth-key');

  beforeEach(() => nock.cleanAll());

  afterEach(() => nock.cleanAll());

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
      expect(posted).to.deep.equal(JSON.parse(gunzipSync(bundle.gzipped()).toString('utf8')));
      expect(scope.isDone()).to.be.true;
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
      const unreachable = { ...COPILOT, address: at(`http://127.0.0.1:${await closedPort()}`) };

      const result = await service.upload(unreachable, bundle, 'bash', 'auth-key');

      expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.NetworkError);
    });

    it('reports an upload that runs out of time as a timeout, not as a service it cannot reach', async () => {
      nock(API_URL).post('/v1/ingest').delay(500).reply(200, { versionId: VERSION_ID, status: 'queued', pageCount: 1 });
      const impatient = new CopilotIngestService({ uploadTimeoutMs: 50 });

      const failure = (await impatient.upload(COPILOT, bundle, 'bash', 'auth-key'))._unsafeUnwrapErr();

      expect(failure.code).to.equal(ServiceErrorCode.Timeout);
      expect(failure.errorMessage).to.equal('The upload did not finish within 1 second.');
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

    it("fails as failed processing, carrying the service's reason, when indexing failed", async () => {
      nock(API_URL)
        .get(`/v1/ingest/${VERSION_ID}`)
        .reply(200, statusBody('building'))
        .get(`/v1/ingest/${VERSION_ID}`)
        .reply(200, statusBody('failed', { error: 'Embedding provider unavailable.' }));

      const failure = (await awaitIndexing())._unsafeUnwrapErr();

      expect(failure.code).to.equal(ServiceErrorCode.ProcessingFailed);
      expect(failure.errorMessage).to.equal('Embedding provider unavailable.');
    });

    it('fails as failed processing with no reason when the service gives none', async () => {
      nock(API_URL).get(`/v1/ingest/${VERSION_ID}`).reply(200, statusBody('failed'));

      const failure = (await awaitIndexing())._unsafeUnwrapErr();

      expect(failure.code).to.equal(ServiceErrorCode.ProcessingFailed);
      expect(failure.errorMessage).to.equal('');
    });

    it('times out on a version that never finishes', async () => {
      nock(API_URL).get(`/v1/ingest/${VERSION_ID}`).times(1000).reply(200, statusBody('building'));
      const impatient = new CopilotIngestService({ pollIntervalMs: 1, indexTimeoutMs: 20 });

      const result = await impatient.awaitIndexing(COPILOT, VERSION_ID, 'bash', 'auth-key');

      expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.Timeout);
      expect(result._unsafeUnwrapErr().errorMessage).to.equal('Indexing timed out.');
    });

    it('refuses a status body it cannot read', async () => {
      nock(API_URL).get(`/v1/ingest/${VERSION_ID}`).reply(200, { status: 'done' });

      expect((await awaitIndexing())._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.InvalidResponse);
    });

    it('reports a status check that runs out of time as a timeout, not as a service it cannot reach', async () => {
      nock(API_URL).get(`/v1/ingest/${VERSION_ID}`).delay(500).reply(200, statusBody('building'));
      const impatient = new CopilotIngestService({ pollIntervalMs: 1, statusTimeoutMs: 50 });

      const failure = (await impatient.awaitIndexing(COPILOT, VERSION_ID, 'bash', 'auth-key'))._unsafeUnwrapErr();

      expect(failure.code).to.equal(ServiceErrorCode.Timeout);
      expect(failure.errorMessage).to.equal('The Ask AI service did not answer within 1 second.');
    });
  });
});
