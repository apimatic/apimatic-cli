import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { ActionResult } from '../../../src/actions/action-result';
import { PreparePortalProjectAction } from '../../../src/actions/portal/prepare-project';
import { PortalAuthorizationService } from '../../../src/infrastructure/services/portal-authorization-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileProblem } from '../../../src/types/file/file-problem';
import { FilePath } from '../../../src/types/file/filePath';
import { CommandMetadata } from '../../../src/types/common/command-metadata';
import { ProjectContext } from '../../../src/types/project-context';
import { TempContext } from '../../../src/types/temp-context';
import {
  completeArtifacts,
  fixtureWithAnalytics,
  PreparePortalProjectStubs,
  stubPreparePortalProject
} from './prepare-project-stubs';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal generate', shell: 'test' };

// What `portal generate` and `portal serve` both run before either does its own part.
describe('PreparePortalProjectAction', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('stops before signing in when the source is on a network share', async function () {
    if (process.platform !== 'win32') this.skip();
    const shared = stubPreparePortalProject();
    const authorize = sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(undefined));
    const onPrepared = sinon.stub();
    const share = new DirectoryPath('\\\\server\\share\\api');

    const result = await new PreparePortalProjectAction(new DirectoryPath(os.tmpdir()), COMMAND_METADATA).execute(
      ProjectContext.in(share),
      { analytics: true },
      { onPrepared }
    );

    expect(result.isFailed()).to.be.true;
    expect(shared.prompts.networkShareUnsupported.calledOnceWith(share.join('src'))).to.be.true;
    expect(authorize.called).to.be.false;
    expect(onPrepared.called).to.be.false;
  });

  describe('the build it uploads', () => {
    const FIXTURE = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default');
    let shared: PreparePortalProjectStubs;
    let onPrepared: sinon.SinonStub;

    const execute = (analytics = true, project = FIXTURE) =>
      new PreparePortalProjectAction(new DirectoryPath(os.tmpdir()), COMMAND_METADATA).execute(
        ProjectContext.in(project),
        { analytics },
        { onPrepared }
      );

    beforeEach(() => {
      shared = stubPreparePortalProject();
      sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(undefined));
      onPrepared = sinon.stub().resolves(ActionResult.success());
    });

    it('is src/ with content/ and without static/', async () => {
      let uploaded: string[] = [];
      // Read while the stub runs: the build's temporary directory is gone once the action returns.
      shared.artifacts.callsFake(async (build: FilePath) => {
        uploaded = new AdmZip(build.toString()).getEntries().map((entry) => entry.entryName);
        return ok(completeArtifacts());
      });

      await execute();

      expect(uploaded).to.include.members(['apimatic.json', 'content/index.md']);
      expect(uploaded.filter((entry) => entry.startsWith('static/'))).to.be.empty;
    });

    describe('with both vendors set', () => {
      let root: string;
      const project = () =>
        fixtureWithAnalytics(FIXTURE, new DirectoryPath(root), {
          googleTagManager: { containerId: 'GTM-ABC123' },
          googleAnalytics: { measurementId: 'G-ABC123' }
        });

      beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-prepare-'));
      });

      afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
      });

      it('warns that Google Analytics counts page changes, before the artifacts are asked for', async () => {
        await execute(true, project());

        expect(shared.prompts.googleAnalyticsCountsPageChanges.calledOnce).to.be.true;
        expect(shared.prompts.googleAnalyticsCountsPageChanges.calledBefore(shared.artifacts)).to.be.true;
        expect(onPrepared.firstCall.args[1].config.usesGoogleAnalytics()).to.be.true;
      });

      it('prepares the project, and hands on the source, with neither vendor tag and no warning under --no-analytics', async () => {
        await execute(false, project());

        expect(shared.prepare.firstCall.args[1].config.identity().analytics.googleTagManager).to.be.null;
        expect(onPrepared.firstCall.args[1].config.identity().analytics.googleTagManager).to.be.null;
        expect(onPrepared.firstCall.args[1].config.usesGoogleAnalytics()).to.be.false;
        expect(shared.prompts.googleAnalyticsCountsPageChanges.called).to.be.false;
      });
    });

    it('does not warn about Google Analytics when it is not set', async () => {
      await execute();

      expect(shared.prompts.googleAnalyticsCountsPageChanges.called).to.be.false;
    });

    it('reports a source it could not zip, without asking for the artifacts', async () => {
      const problem: FileProblem = { kind: 'zipFailed', reason: 'EBUSY: resource busy or locked' };
      sinon.stub(TempContext.prototype, 'zip').resolves(err(problem));

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(shared.prompts.sourceNotZipped.calledOnceWith(problem, FIXTURE.join('src'))).to.be.true;
      expect(shared.artifacts.called).to.be.false;
      expect(onPrepared.called).to.be.false;
    });
  });
});
