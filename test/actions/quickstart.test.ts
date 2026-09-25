import fs from 'fs';
import os from 'os';
import path from 'path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { QuickstartAction } from '../../src/actions/quickstart';
import { PortalQuickstartPrompts } from '../../src/prompts/portal/quickstart';
import { QuickstartPrompts } from '../../src/prompts/quickstart';
import { ApiValidatePrompts } from '../../src/prompts/api/validate';
import { PortalAuthorizationService } from '../../src/infrastructure/services/portal-authorization-service';
import { PortalProjectService } from '../../src/infrastructure/portal-project-service';
import { ValidationService } from '../../src/infrastructure/services/validation-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';
import { CommandMetadata } from '../../src/types/common/command-metadata';
import { Language } from '../../src/types/sdk/generate';
import { PortalArtifactsService } from '../../src/infrastructure/services/portal-artifacts-service';
import { PortalArtifacts } from '../../src/types/portal/portal-artifacts';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal quickstart', shell: 'test' };
const SPEC = new FilePath(
  new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default/spec'),
  new FileName('Apimatic-Calculator.json')
);

const PASSED = { isSuccess: true, blocking: [], errors: [], warnings: [], information: [] };

describe('QuickstartAction', () => {
  let root: string;
  let project: DirectoryPath;
  let prompts: sinon.SinonStubbedInstance<PortalQuickstartPrompts>;
  let runtimeProblem: sinon.SinonStub;
  let authorize: sinon.SinonStub;

  const execute = () => new QuickstartAction(new DirectoryPath(root), COMMAND_METADATA).execute();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-quickstart-'));
    // Signed in already, so the wizard goes straight to its questions.
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ email: 'a@b.test', authKey: 'auth-key' }));
    project = new DirectoryPath(root).join('project');
    fs.mkdirSync(project.toString());

    prompts = sinon.stub(PortalQuickstartPrompts.prototype);
    sinon.stub(QuickstartPrompts.prototype, 'welcomeMessage');
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

  // The wizard ends in a preview now, so this covers what it writes on the way there: the
  // languages it was told, the placeholder plugin identity, and the entries none of it belongs
  // in a repository under. `prepare` is stopped so the test is about the writing, not the build.
  it('records the languages and the placeholder plugin identity, then hands off to the preview', async () => {
    prompts.selectLanguages.resolves([Language.TYPESCRIPT, Language.PYTHON]);
    // The preview asks the service for artifacts before it prepares anything; a portal declaring
    // three languages would otherwise reach the network from a unit test.
    const artifacts = sinon
      .stub(PortalArtifactsService.prototype, 'generate')
      .resolves(ok(PortalArtifacts.none()));
    const prepare = sinon.stub(PortalProjectService.prototype, 'prepare').resolves(err('stopped here'));

    await execute();

    const written = JSON.parse(fs.readFileSync(path.join(project.toString(), 'src', 'apimatic.json'), 'utf8'));
    expect(written.languages).to.deep.equal({ typescript: {}, python: {} });
    expect(written.plugin).to.deep.equal({
      pluginId: 'my-api-plugin',
      pluginName: 'My API Plugin',
      pluginVersion: '0.1.0',
      license: 'MIT'
    });
    expect(written.portal, 'the portal block survives the language write').to.not.be.undefined;

    expect(fs.existsSync(path.join(project.toString(), 'src', 'spec', 'Apimatic-Calculator.json'))).to.be.true;
    expect(fs.readFileSync(path.join(project.toString(), '.gitignore'), 'utf8')).to.contain('/plugin/');

    // Reaching either is the handoff: nothing else in the wizard asks for artifacts or
    // prepares a project.
    expect(artifacts.called, 'the wizard asked for the artifacts').to.be.true;
    expect(prepare.called, 'the wizard reached the preview').to.be.true;
  });

  it('asks for nothing more and stops when no language is chosen', async () => {
    prompts.selectLanguages.resolves([]);

    expect((await execute()).isCancelled()).to.be.true;
    expect(prompts.noLanguagesSelected.calledOnce).to.be.true;
  });

});
