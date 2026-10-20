import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';
import { expect } from 'chai';
import { gunzipSync } from 'node:zlib';
import { err, ok } from 'neverthrow';
import { PortalCopilotSyncAction } from '../../../../src/actions/portal/copilot/sync';
import { CopilotIngestService } from '../../../../src/infrastructure/services/copilot-ingest-service';
import { ServiceError, ServiceErrorCode } from '../../../../src/infrastructure/service-error';
import { PortalCopilotSyncPrompts } from '../../../../src/prompts/portal/copilot/sync';
import { CommandMetadata } from '../../../../src/types/common/command-metadata';
import { DirectoryPath } from '../../../../src/types/file/directoryPath';
import { FileName } from '../../../../src/types/file/fileName';
import { FilePath } from '../../../../src/types/file/filePath';
import { ZipService } from '../../../../src/infrastructure/zip-service';
import { CopilotBundle } from '../../../../src/types/portal/copilot/copilot-bundle';
import { ProjectContext } from '../../../../src/types/project-context';
import { SiteAddress } from '../../../../src/types/portal/config/site-address';
import { GeneratedPortalContext } from '../../../../src/types/portal/copilot/generated-portal-context';

/** The bundle as the service receives it. */
const uploaded = (bundle: CopilotBundle) =>
  JSON.parse(gunzipSync(bundle.gzipped()).toString('utf8')) as {
    basePath: string;
    siteUrl: string | null;
    pages: { path: string }[];
  };

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal:copilot:sync', shell: 'test' };
const COPILOT = { key: 'pk_test', apiUrl: 'https://ask.apimatic.io' };

const indexed = (status: 'active' | 'superseded') => ({
  versionId: 'v-1',
  status,
  pageCount: 2,
  changedPages: 1,
  removedPages: 0,
  chunkCount: 5,
  error: null
});

describe('PortalCopilotSyncAction', () => {
  let root: string;
  let prompts: sinon.SinonStubbedInstance<PortalCopilotSyncPrompts>;
  let upload: sinon.SinonStub;
  let awaitIndexing: sinon.SinonStub;

  const write = (relative: string, contents: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };

  const writeConfig = (ai: unknown, url = 'https://example.com/docs') =>
    write(
      'src/apimatic.json',
      JSON.stringify({
        portal: { site: { name: 'Acme', url }, ...(ai ? { ai } : {}) },
        languages: { typescript: {} }
      })
    );

  const writeSavedLogin = (authKey: string) => write('config.json', JSON.stringify({ email: 'a@b.c', authKey }));

  /** As `generate` writes it into a portal built for `https://example.com/docs`. */
  const PUBLISHED = CopilotBundle.of(
    [
      { path: '/', title: 'Docs', description: null, markdown: '# Docs' },
      { path: '/guides/intro', title: 'Intro', description: 'Start', markdown: '# Intro' }
    ],
    SiteAddress.parse('https://example.com/docs', 'url')._unsafeUnwrap(),
    '9.9.9',
    new Date('2026-10-14T12:00:00.000Z')
  );

  const writePortal = () => write('portal/__copilot/bundle.json', PUBLISHED.toJson());

  const execute = (wait = true, authKey: string | null = 'auth-key') => {
    const project = ProjectContext.in(new DirectoryPath(root));
    return new PortalCopilotSyncAction(new DirectoryPath(root), COMMAND_METADATA, authKey).execute(
      project,
      project.portalDirectory(),
      wait
    );
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-sync-'));
    prompts = sinon.stub(PortalCopilotSyncPrompts.prototype);
    // The spinners would render to stdout; pass the underlying promise straight through.
    prompts.upload.callsFake((fn) => fn);
    prompts.awaitIndexing.callsFake((fn) => fn);
    upload = sinon
      .stub(CopilotIngestService.prototype, 'upload')
      .resolves(ok({ versionId: 'v-1', status: 'queued', pageCount: 2 }));
    awaitIndexing = sinon.stub(CopilotIngestService.prototype, 'awaitIndexing').resolves(ok(indexed('active')));
    writeConfig({ copilot: COPILOT });
    writePortal();
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('uploads the bundle generate wrote, as it is, and waits until Ask AI answers from it', async () => {
    // The address has changed since the portal was generated: the bundle keeps the one it was built for.
    writeConfig({ copilot: COPILOT }, 'https://example.com/api');

    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    const [copilot, bundle, , authKey] = upload.firstCall.args as [unknown, CopilotBundle, unknown, string];
    expect(copilot).to.deep.include(COPILOT);
    expect(authKey).to.equal('auth-key');
    expect(bundle.toJson()).to.equal(PUBLISHED.toJson());
    expect(uploaded(bundle)).to.deep.include({ basePath: '/docs/', siteUrl: 'https://example.com/docs' });
    expect(awaitIndexing.firstCall.args[1]).to.equal('v-1');
    expect(prompts.indexed.calledOnceWith(indexed('active'))).to.be.true;
  });

  it('uploads the bundle of a portal generated with --zip, which holds only the archive', async () => {
    const portal = path.join(root, 'portal');
    const archive = new FilePath(new DirectoryPath(root), new FileName('portal.zip'));
    (await new ZipService().archive(new DirectoryPath(portal), archive))._unsafeUnwrap();
    fs.rmSync(portal, { recursive: true });
    fs.mkdirSync(portal);
    fs.renameSync(archive.toString(), path.join(portal, 'portal.zip'));

    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect((upload.firstCall.args[1] as CopilotBundle).toJson()).to.equal(PUBLISHED.toJson());
  });

  it('reports a portal Ask AI already answers from, without waiting', async () => {
    upload.resolves(ok({ versionId: 'v-0', status: 'unchanged', pageCount: 2 }));

    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect(prompts.alreadyUpToDate.calledOnceWith(2)).to.be.true;
    expect(awaitIndexing.called).to.be.false;
  });

  it('returns once uploaded with --no-wait', async () => {
    const result = await execute(false);

    expect(result.isSuccess()).to.be.true;
    expect(prompts.indexingQueued.calledOnce).to.be.true;
    expect(awaitIndexing.called).to.be.false;
  });

  it('succeeds, saying so, when a newer sync superseded this one', async () => {
    awaitIndexing.resolves(ok(indexed('superseded')));

    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect(prompts.superseded.calledOnce).to.be.true;
  });

  it("fails with the service's refusal, naming the service", async () => {
    const forbidden = ServiceError.forbidden('This key cannot sync this portal.');
    upload.resolves(err(forbidden));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.uploadFailed.calledOnceWith(forbidden, COPILOT.apiUrl)).to.be.true;
  });

  it('fails when the service cannot be reached', async () => {
    upload.resolves(err(ServiceError.NetworkError));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.uploadFailed.firstCall.args[0].code).to.equal(ServiceErrorCode.NetworkError);
  });

  it('fails when indexing fails', async () => {
    const failed = ServiceError.processingFailed('Embedding provider unavailable.');
    awaitIndexing.resolves(err(failed));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.indexingFailed.calledOnceWith(failed, COPILOT.apiUrl)).to.be.true;
  });

  it('refuses, without uploading, a service APIMatic does not run', async () => {
    writeSavedLogin('saved-key');
    writeConfig({ copilot: { ...COPILOT, apiUrl: 'https://ask.example.com' } });

    const result = await execute(true, null);

    expect(result.isFailed()).to.be.true;
    expect(prompts.sourceProblem.calledOnce).to.be.true;
    expect(upload.called).to.be.false;
  });

  it('uses the passed key, else the saved login, a blank --auth-key counting as none', async () => {
    writeSavedLogin('saved-key');

    for (const apiUrl of ['https://ask.apimatic.io', 'http://localhost:8787']) {
      writeConfig({ copilot: { ...COPILOT, apiUrl } });

      for (const passed of ['passed-key', null, '', '   ']) {
        expect((await execute(true, passed)).isSuccess(), `${apiUrl} ${JSON.stringify(passed)}`).to.be.true;
      }
    }
    const sent = ['passed-key', 'saved-key', 'saved-key', 'saved-key'];
    expect(upload.args.map((args) => args[3])).to.deep.equal([...sent, ...sent]);
    expect(awaitIndexing.args.map((args) => args[3])).to.deep.equal([...sent, ...sent]);
  });

  it('asks the user to log in, without uploading, when no key is passed or saved', async () => {
    writeConfig({ copilot: { ...COPILOT, apiUrl: 'https://ask.apimatic.io' } });
    // `auth logout` leaves the file with a blank key.
    writeSavedLogin('');

    const result = await execute(true, null);

    expect(result.isFailed()).to.be.true;
    expect(prompts.notLoggedIn.calledOnce).to.be.true;
    expect(upload.called).to.be.false;
  });

  it('fails without uploading when the portal has no Ask AI chat', async () => {
    writeConfig(null);

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.copilotNotConfigured.calledOnce).to.be.true;
    expect(upload.called).to.be.false;
  });

  it('fails without uploading when apimatic.json is missing', async () => {
    fs.rmSync(path.join(root, 'src', 'apimatic.json'));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.sourceProblem.firstCall.args[0]).to.deep.equal({ kind: 'missingConfig' });
    expect(upload.called).to.be.false;
  });

  it('fails without uploading when the portal cannot be read', async () => {
    sinon.stub(GeneratedPortalContext.prototype, 'bundle').resolves(err('EACCES: permission denied'));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.portalNotRead.calledOnceWith(sinon.match.any, 'EACCES: permission denied')).to.be.true;
    expect(upload.called).to.be.false;
  });

  it('fails without uploading when the portal has not been generated, or was without Ask AI', async () => {
    fs.rmSync(path.join(root, 'portal', '__copilot'), { recursive: true });
    write('portal/index.html', '<html></html>');

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.portalNotGenerated.calledOnce).to.be.true;
    expect(upload.called).to.be.false;
  });
});
