import os from 'os';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { ActionResult } from '../../../src/actions/action-result';
import { PreparePortalProjectAction } from '../../../src/actions/portal/prepare-project';
import { PortalAuthorizationService } from '../../../src/infrastructure/services/portal-authorization-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { CommandMetadata } from '../../../src/types/common/command-metadata';
import { ProjectContext } from '../../../src/types/project-context';
import { stubPreparePortalProject } from './prepare-project-stubs';
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
    expect(shared.prompts.authorizationFailed.calledOnceWith({ kind: 'notEntitled', feature: 'portalGeneration' })).to.be.true;
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
      expect(shared.prompts.askAiNotEntitled.calledOnceWith(COPILOT_FIXTURE.join('src'))).to.be.true;
      expect(shared.artifacts.called).to.be.false;
      expect(onPrepared.called).to.be.false;
    });

    it('prepares a portal without the chat on a plan without Ask AI', async () => {
      const shared = stubPreparePortalProject();
      withPlan('portalGeneration');
      const onPrepared = sinon.stub().resolves(ActionResult.success());

      const result = await execute(onPrepared);

      expect(result.isSuccess()).to.be.true;
      expect(shared.prompts.askAiNotEntitled.called).to.be.false;
      expect(onPrepared.calledOnce).to.be.true;
    });
  });

  it('stops before signing in when the source is on a network share', async function () {
    if (process.platform !== 'win32') this.skip();
    const shared = stubPreparePortalProject();
    const authorize = sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(entitlementsWith('portalGeneration')));
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
});
