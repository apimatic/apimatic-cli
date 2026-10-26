import os from 'os';
import sinon from 'sinon';
import { expect } from 'chai';
import { ok } from 'neverthrow';
import { PreparePortalProjectAction } from '../../../src/actions/portal/prepare-project';
import { PortalAuthorizationService } from '../../../src/infrastructure/services/portal-authorization-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { CommandMetadata } from '../../../src/types/common/command-metadata';
import { ProjectContext } from '../../../src/types/project-context';
import { stubPreparePortalProject } from './prepare-project-stubs';

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
      { onPrepared }
    );

    expect(result.isFailed()).to.be.true;
    expect(shared.prompts.networkShareUnsupported.calledOnceWith(share.join('src'))).to.be.true;
    expect(authorize.called).to.be.false;
    expect(onPrepared.called).to.be.false;
  });
});
