import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { PortalCopilotSyncAction } from '../../../../src/actions/portal/copilot/sync';
import { CopilotIngestService } from '../../../../src/infrastructure/services/copilot-ingest-service';
import { ServiceError, ServiceErrorCode } from '../../../../src/infrastructure/service-error';
import { PortalCopilotSyncPrompts } from '../../../../src/prompts/portal/copilot/sync';
import { CommandMetadata } from '../../../../src/types/common/command-metadata';
import { DirectoryPath } from '../../../../src/types/file/directoryPath';
import { CopilotBundle } from '../../../../src/types/portal/copilot/copilot-bundle';
import { ProjectContext } from '../../../../src/types/project-context';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal:copilot:sync', shell: 'test' };
const COPILOT = { key: 'pk_test', apiUrl: 'http://copilot.test' };

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

  const writeConfig = (ai: unknown) =>
    write(
      'src/apimatic.json',
      JSON.stringify({
        portal: { site: { name: 'Acme', url: 'https://example.com/docs' }, ...(ai ? { ai } : {}) },
        languages: { typescript: {} }
      })
    );

  const writePortal = () => {
    write('portal/llms.txt', ['- [Docs](/docs)', '  - [Intro](/docs/guides/intro): Start'].join('\n'));
    write('portal/index.md', '# Docs');
    write('portal/guides/intro.md', '# Intro');
  };

  const execute = (wait = true) => {
    const project = ProjectContext.in(new DirectoryPath(root));
    return new PortalCopilotSyncAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
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

  it('uploads the portal under its base path and waits until Ask AI answers from it', async () => {
    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    const [copilot, bundle, , , authKey] = upload.firstCall.args as [unknown, CopilotBundle, unknown, unknown, string];
    expect(copilot).to.deep.include(COPILOT);
    expect(authKey).to.equal('auth-key');
    expect(bundle.toJSON()).to.deep.include({ basePath: '/docs/', siteUrl: 'https://example.com/docs' });
    expect(bundle.toJSON().pages.map(({ path: page }) => page)).to.deep.equal(['/', '/guides/intro']);
    expect(awaitIndexing.firstCall.args[1]).to.equal('v-1');
    expect(prompts.indexed.calledOnceWith(indexed('active'))).to.be.true;
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
    expect(prompts.syncFailed.calledOnceWith(forbidden, COPILOT.apiUrl)).to.be.true;
  });

  it('fails when the service cannot be reached', async () => {
    upload.resolves(err(ServiceError.NetworkError));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.syncFailed.firstCall.args[0].code).to.equal(ServiceErrorCode.NetworkError);
  });

  it('fails when indexing fails', async () => {
    const failed = ServiceError.badRequest('Embedding provider unavailable.', {});
    awaitIndexing.resolves(err(failed));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.syncFailed.calledOnceWith(failed, COPILOT.apiUrl)).to.be.true;
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

  it('fails without uploading when the portal has not been generated', async () => {
    fs.rmSync(path.join(root, 'portal'), { recursive: true });

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.portalNotGenerated.calledOnce).to.be.true;
    expect(upload.called).to.be.false;
  });

  it('fails without uploading when no listed page has its Markdown', async () => {
    fs.rmSync(path.join(root, 'portal', 'index.md'));
    fs.rmSync(path.join(root, 'portal', 'guides'), { recursive: true });

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.noPages.calledOnce).to.be.true;
    expect(upload.called).to.be.false;
  });
});
