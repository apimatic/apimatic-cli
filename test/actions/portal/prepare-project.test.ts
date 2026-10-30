import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { ActionResult } from '../../../src/actions/action-result';
import { PreparePortalProjectAction } from '../../../src/actions/portal/prepare-project';
import { ServiceError } from '../../../src/infrastructure/service-error';
import { PortalAuthorizationService } from '../../../src/infrastructure/services/portal-authorization-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileProblem } from '../../../src/types/file/file-problem';
import { FilePath } from '../../../src/types/file/filePath';
import { CommandMetadata } from '../../../src/types/common/command-metadata';
import { ProjectContext } from '../../../src/types/project-context';
import { TempContext } from '../../../src/types/temp-context';
import { completeArtifacts, PreparePortalProjectStubs, stubPreparePortalProject } from './prepare-project-stubs';
import { entitlementsWith } from '../../helpers/account';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal generate', shell: 'test' };
const FIXTURE = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default');

// What `portal generate` and `portal serve` both run before either does its own part.
describe('PreparePortalProjectAction', () => {
  afterEach(() => {
    sinon.restore();
  });

  // `onPrepared` is the build for `generate` and the preview for `serve`.
  const execute = (onPrepared: sinon.SinonStub) =>
    new PreparePortalProjectAction(new DirectoryPath(os.tmpdir()), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(FIXTURE),
      { onPrepared }
    );

  it('stops before anything else when the installation cannot build a portal', async () => {
    const shared = stubPreparePortalProject();
    shared.runtimeProblem.returns("The portal build dependency 'vite' is missing from this installation.");
    const authorize = sinon.stub(PortalAuthorizationService.prototype, 'authorize');
    const onPrepared = sinon.stub();

    const result = await execute(onPrepared);

    expect(result.isFailed()).to.be.true;
    expect(
      shared.prompts.runtimeUnsupported.calledOnceWith(
        "The portal build dependency 'vite' is missing from this installation."
      )
    ).to.be.true;
    expect(authorize.called).to.be.false;
    expect(onPrepared.called).to.be.false;
  });

  it('fails when the account may not build a portal, without going on to build or preview it', async () => {
    const shared = stubPreparePortalProject();
    sinon
      .stub(PortalAuthorizationService.prototype, 'authorize')
      .resolves(err({ kind: 'notEntitled' as const, feature: 'portalGeneration' as const }));
    const onPrepared = sinon.stub();

    const result = await execute(onPrepared);

    expect(result.isFailed()).to.be.true;
    expect(shared.prompts.authorizationFailed.calledOnceWith({ kind: 'notEntitled', feature: 'portalGeneration' })).to
      .be.true;
    expect(shared.artifacts.called).to.be.false;
    expect(onPrepared.called).to.be.false;
  });

  describe('Ask AI', () => {
    const COPILOT_FIXTURE = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/copilot');
    const withPlan = (...features: Parameters<typeof entitlementsWith>) =>
      sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(entitlementsWith(...features)));

    it('refuses a portal with the chat when the plan lacks Ask AI, before requesting anything', async () => {
      const shared = stubPreparePortalProject();
      withPlan('portalGeneration');
      const onPrepared = sinon.stub();

      const result = await new PreparePortalProjectAction(
        new DirectoryPath(os.tmpdir()),
        COMMAND_METADATA,
        'auth-key'
      ).execute(ProjectContext.in(COPILOT_FIXTURE), { onPrepared });

      expect(result.isFailed()).to.be.true;
      expect(
        shared.prompts.askAiNotEntitled.calledOnceWith(
          { kind: 'notEntitled', feature: 'askAi' },
          COPILOT_FIXTURE.join('src')
        )
      ).to.be.true;
      expect(shared.artifacts.called).to.be.false;
      expect(onPrepared.called).to.be.false;
    });

    it('refuses a portal whose chat key is not an Ask AI key, before requesting anything', async () => {
      const shared = stubPreparePortalProject();
      withPlan('portalGeneration', 'askAi');
      const onPrepared = sinon.stub();
      const project = new DirectoryPath(fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-key-')));
      fs.cpSync(COPILOT_FIXTURE.toString(), project.toString(), { recursive: true });
      const configFile = path.join(project.toString(), 'src', 'apimatic.json');
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      config.portal.ai.copilot.key = 'fsdfsddfsd';
      fs.writeFileSync(configFile, JSON.stringify(config));

      try {
        const result = await new PreparePortalProjectAction(
          new DirectoryPath(os.tmpdir()),
          COMMAND_METADATA,
          'auth-key'
        ).execute(ProjectContext.in(project), { onPrepared });

        expect(result.isFailed()).to.be.true;
        expect(shared.prompts.copilotKeyUnrecognized.calledOnceWith(project.join('src'))).to.be.true;
        expect(shared.prompts.askAiNotEntitled.called).to.be.false;
        expect(shared.lookUpCopilotKey.called).to.be.false;
        expect(shared.artifacts.called).to.be.false;
        expect(onPrepared.called).to.be.false;
      } finally {
        fs.rmSync(project.toString(), { recursive: true, force: true });
      }
    });

    const executeCopilot = (onPrepared: sinon.SinonStub) =>
      new PreparePortalProjectAction(new DirectoryPath(os.tmpdir()), COMMAND_METADATA, 'auth-key').execute(
        ProjectContext.in(COPILOT_FIXTURE),
        { onPrepared }
      );

    it('refuses a key the service does not hold for the account, before requesting anything', async () => {
      for (const outcome of ['unknown', 'otherAccount'] as const) {
        sinon.restore();
        const shared = stubPreparePortalProject();
        shared.lookUpCopilotKey.resolves(ok(outcome));
        withPlan('portalGeneration', 'askAi');
        const onPrepared = sinon.stub();

        const result = await executeCopilot(onPrepared);

        expect(result.isFailed(), outcome).to.be.true;
        expect(shared.lookUpCopilotKey.firstCall.args.slice(1)).to.deep.equal([
          'pk_live_e2eFixtureKey00000000000000000',
          'test',
          'auth-key'
        ]);
        expect(shared.prompts.copilotKeyNotRegistered.calledOnceWith(outcome, COPILOT_FIXTURE.join('src')), outcome).to
          .be.true;
        expect(shared.artifacts.called, outcome).to.be.false;
        expect(onPrepared.called, outcome).to.be.false;
      }
    });

    it('builds anyway, with a warning, when the service cannot say', async () => {
      const shared = stubPreparePortalProject();
      shared.lookUpCopilotKey.resolves(err(ServiceError.NetworkError));
      withPlan('portalGeneration', 'askAi');
      const onPrepared = sinon.stub().resolves(ActionResult.success());

      const result = await executeCopilot(onPrepared);

      expect(result.isSuccess()).to.be.true;
      expect(shared.prompts.copilotKeyNotChecked.calledOnceWith(ServiceError.NetworkError)).to.be.true;
      expect(shared.prompts.copilotKeyNotRegistered.called).to.be.false;
      expect(onPrepared.calledOnce).to.be.true;
    });

    it('prepares a portal without the chat on a plan without Ask AI', async () => {
      const shared = stubPreparePortalProject();
      withPlan('portalGeneration');
      const onPrepared = sinon.stub().resolves(ActionResult.success());

      const result = await execute(onPrepared);

      expect(result.isSuccess()).to.be.true;
      expect(shared.prompts.askAiNotEntitled.called).to.be.false;
      expect(shared.lookUpCopilotKey.called).to.be.false;
      expect(onPrepared.calledOnce).to.be.true;
    });
  });

  it('stops before signing in when the source is on a network share', async function () {
    if (process.platform !== 'win32') this.skip();
    const shared = stubPreparePortalProject();
    const authorize = sinon
      .stub(PortalAuthorizationService.prototype, 'authorize')
      .resolves(ok(entitlementsWith('portalGeneration')));
    const onPrepared = sinon.stub();
    const share = new DirectoryPath('\\\\server\\share\\api');

    const result = await new PreparePortalProjectAction(new DirectoryPath(os.tmpdir()), COMMAND_METADATA).execute(
      ProjectContext.in(share),
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

    const execute = () =>
      new PreparePortalProjectAction(new DirectoryPath(os.tmpdir()), COMMAND_METADATA).execute(
        ProjectContext.in(FIXTURE),
        { onPrepared }
      );

    beforeEach(() => {
      shared = stubPreparePortalProject();
      sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(entitlementsWith('portalGeneration')));
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
