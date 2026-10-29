import os from 'os';
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
import { completeArtifacts, PreparePortalProjectStubs, stubPreparePortalProject } from './prepare-project-stubs';

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
