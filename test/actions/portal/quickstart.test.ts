import fs from 'fs';
import os from 'os';
import path from 'path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { PortalQuickstartAction } from '../../../src/actions/portal/quickstart';
import { PortalQuickstartPrompts } from '../../../src/prompts/portal/quickstart';
import { PortalDevServerService } from '../../../src/infrastructure/portal-dev-server-service';
import { ApiValidatePrompts } from '../../../src/prompts/api/validate';
import { PortalAuthorizationService } from '../../../src/infrastructure/services/portal-authorization-service';
import { PortalProjectService } from '../../../src/infrastructure/portal-project-service';
import { ValidationService } from '../../../src/infrastructure/services/validation-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { CommandMetadata } from '../../../src/types/common/command-metadata';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal quickstart', shell: 'test' };
const SPEC = new FilePath(
  new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default/spec'),
  new FileName('Apimatic-Calculator.json')
);

const PASSED = { isSuccess: true, blocking: [], errors: [], warnings: [], information: [] };

describe('PortalQuickstartAction', () => {
  let root: string;
  let project: DirectoryPath;
  let prompts: sinon.SinonStubbedInstance<PortalQuickstartPrompts>;
  let runtimeProblem: sinon.SinonStub;
  let authorize: sinon.SinonStub;

  const execute = () => new PortalQuickstartAction(new DirectoryPath(root), COMMAND_METADATA).execute();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-quickstart-'));
    // Signed in already, so the wizard goes straight to its questions.
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ email: 'a@b.test', authKey: 'auth-key' }));
    project = new DirectoryPath(root).join('project');
    fs.mkdirSync(project.toString());

    prompts = sinon.stub(PortalQuickstartPrompts.prototype);
    prompts.specPathPrompt.resolves(SPEC);
    prompts.inputDirectoryPathPrompt.resolves(project);

    sinon.stub(ApiValidatePrompts.prototype, 'validateApi').callsFake((fn) => fn);
    sinon
      .stub(ValidationService.prototype, 'validateViaFile')
      .resolves(ok({ result: { validation: PASSED, linting: PASSED }, unallowedFeatures: null } as never));
    runtimeProblem = sinon.stub(PortalProjectService.prototype, 'runtimeProblem').returns(null);
    authorize = sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(undefined));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  // The user's next command is `portal serve`, which refuses on both, so neither is left to it.
  it('stops before any question when the installation cannot build a portal', async () => {
    runtimeProblem.returns("The portal build dependency 'vite' is missing from this installation.");

    expect((await execute()).isFailed()).to.be.true;
    expect(prompts.runtimeUnsupported.calledOnce).to.be.true;
    expect(prompts.specPathPrompt.called).to.be.false;
  });

  it('stops before any question when the account may not build a portal', async () => {
    authorize.resolves(err({ kind: 'notEntitled' as const }));

    expect((await execute()).isFailed()).to.be.true;
    expect(prompts.authorizationFailed.calledOnceWith({ kind: 'notEntitled' })).to.be.true;
    expect(prompts.specPathPrompt.called).to.be.false;
  });

  // Nothing in the wizard asks for the project's SDK languages yet, and a preview refuses a
  // project without one, so it ends at the scaffold and says what to add.
  it('writes the project and ends with the next steps rather than a preview', async () => {
    const serve = sinon.stub(PortalDevServerService.prototype, 'start');

    const result = await execute();

    expect(result.isFailed() || result.isCancelled(), 'the wizard failed').to.be.false;
    const written = JSON.parse(fs.readFileSync(path.join(project.toString(), 'src', 'apimatic.json'), 'utf8'));
    expect(Object.keys(written)).to.deep.equal(['$schema', 'schemaVersion', 'portal']);
    expect(fs.existsSync(path.join(project.toString(), 'src', 'spec', 'Apimatic-Calculator.json'))).to.be.true;
    expect(prompts.nextSteps.calledOnce).to.be.true;
    const [configFile, projectDirectory] = prompts.nextSteps.firstCall.args;
    expect(configFile.isEqual(new FilePath(project.join('src'), new FileName('apimatic.json')))).to.be.true;
    expect(projectDirectory.isEqual(project)).to.be.true;
    expect(prompts.nextSteps.calledAfter(prompts.printDirectoryStructure)).to.be.true;
    expect(serve.called).to.be.false;
  });
});
