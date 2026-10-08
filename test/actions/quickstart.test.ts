import fs from 'fs';
import os from 'os';
import path from 'path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { ActionResult } from '../../src/actions/action-result';
import { QuickstartAction } from '../../src/actions/quickstart';
import { QuickstartPrompts } from '../../src/prompts/quickstart';
import { PreparePortalProjectPrompts } from '../../src/prompts/portal/prepare-project';
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
import { FileDownloadService } from '../../src/infrastructure/services/file-download-service';
import { ServiceError } from '../../src/infrastructure/service-error';
import { UrlPath } from '../../src/types/file/urlPath';
import { ProjectContext } from '../../src/types/project-context';
import { completeArtifacts } from './portal/prepare-project-stubs';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal quickstart', shell: 'test' };
const SPEC = new FilePath(
  new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default/src/spec'),
  new FileName('Apimatic-Calculator.json')
);
const SAMPLE_URL = new UrlPath(
  'https://raw.githubusercontent.com/apimatic/sample-docs-as-code-portal/refs/heads/v2/src/spec/openapi.json'
);

const PASSED = { isSuccess: true, blocking: [], errors: [], warnings: [], information: [] };
const FAILED = { isSuccess: false, blocking: [], errors: ['bad'], warnings: [], information: [] };

const downloadOf = (filename: string) =>
  ok({ stream: fs.createReadStream(SPEC.toString()), filename: new FileName(filename) });

describe('QuickstartAction', () => {
  let root: string;
  let projectDirectory: DirectoryPath;
  let prompts: sinon.SinonStubbedInstance<QuickstartPrompts>;
  let runtimeProblem: sinon.SinonStub;
  let authorize: sinon.SinonStub;
  let validateViaFile: sinon.SinonStub;

  // `root` holds no `src/`, so every test but the adopting ones takes the importing path.
  const execute = (workingDirectory: DirectoryPath = new DirectoryPath(root)) =>
    new QuickstartAction(new DirectoryPath(root), COMMAND_METADATA).execute(workingDirectory);

  const failValidation = () => validateViaFile.resolves(ok({ validation: FAILED, linting: PASSED } as never));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-quickstart-'));
    // Signed in already, so the wizard goes straight to its questions.
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ email: 'a@b.test', authKey: 'auth-key' }));
    projectDirectory = new DirectoryPath(root).join('project');
    fs.mkdirSync(projectDirectory.toString());

    prompts = sinon.stub(QuickstartPrompts.prototype);
    prompts.specPathPrompt.resolves(SPEC);
    prompts.projectDirectoryPrompt.resolves(projectDirectory);
    prompts.downloadSpecFile.callsFake((fn) => fn);

    sinon.stub(ApiValidatePrompts.prototype, 'validateApi').callsFake((fn) => fn);
    validateViaFile = sinon
      .stub(ValidationService.prototype, 'validateViaFile')
      .resolves(ok({ validation: PASSED, linting: PASSED } as never));
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
    // three languages would otherwise reach the network from a unit test. They back every page, as
    // a real run's do, or the preview would refuse to prepare the project.
    const artifacts = sinon
      .stub(PortalArtifactsService.prototype, 'generate')
      .resolves(ok(completeArtifacts([Language.TYPESCRIPT, Language.PYTHON])));
    const prepare = sinon.stub(PortalProjectService.prototype, 'prepare').resolves(err('stopped here'));

    await execute();

    const written = JSON.parse(fs.readFileSync(path.join(projectDirectory.toString(), 'src', 'apimatic.json'), 'utf8'));
    expect(written.languages).to.deep.equal({ typescript: {}, python: {} });
    expect(written.plugin).to.deep.equal({
      pluginId: 'my-api-plugin',
      pluginName: 'My API Plugin',
      pluginVersion: '0.1.0',
      license: 'MIT'
    });
    expect(written.portal, 'the portal block survives the language write').to.not.be.undefined;

    expect(fs.existsSync(path.join(projectDirectory.toString(), 'src', 'spec', 'Apimatic-Calculator.json'))).to.be.true;
    expect(fs.readFileSync(path.join(projectDirectory.toString(), '.gitignore'), 'utf8')).to.contain('/plugin/');

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

  // A build downloaded from the platform arrives with `src/spec/` filled, beside its own
  // `apimatic.json`. Asking such a user for the specification their project carries, and then
  // for where to put it, is the pair of questions this adoption exists to skip.
  describe('a project that already carries a source directory', () => {
    let downloaded: DirectoryPath;
    const inSource = (...parts: string[]) => path.join(downloaded.toString(), 'src', ...parts);

    beforeEach(() => {
      downloaded = new DirectoryPath(root).join('downloaded');
      fs.mkdirSync(inSource('spec'), { recursive: true });
      fs.copyFileSync(SPEC.toString(), inSource('spec', 'Apimatic-Calculator.json'));
      fs.writeFileSync(inSource('apimatic.json'), '{}');
    });

    it('validates the specification it finds instead of asking for one, or for its languages', async () => {
      fs.writeFileSync(inSource('apimatic.json'), JSON.stringify({ languages: { typescript: {} } }));
      sinon.stub(PortalArtifactsService.prototype, 'generate').resolves(ok(completeArtifacts([Language.TYPESCRIPT])));
      const prepare = sinon.stub(PortalProjectService.prototype, 'prepare').resolves(err('stopped here'));

      await execute(downloaded);

      expect(prompts.specPathPrompt.called, 'asked for a specification the project has').to.be.false;
      expect(prompts.projectDirectoryPrompt.called, 'asked where to put a project that exists').to.be.false;
      expect(prompts.selectLanguages.called, 'asked for languages the project records itself').to.be.false;

      const written = JSON.parse(fs.readFileSync(inSource('apimatic.json'), 'utf8'));
      expect(written.languages).to.deep.equal({ typescript: {} });
      expect(written.portal.site, 'a site is added to the project it adopted').to.not.be.undefined;
      expect(written.plugin).to.deep.equal({
        pluginId: 'my-api-plugin',
        pluginName: 'My API Plugin',
        pluginVersion: '0.1.0',
        license: 'MIT'
      });
      expect(prepare.called, 'the wizard reached the preview').to.be.true;

      // The one that was there, and no copy of it beside itself.
      expect(fs.readdirSync(inSource('spec'))).to.deep.equal(['Apimatic-Calculator.json']);
    });

    const namingNoLanguage: [string, string][] = [
      ['has no languages block', '{}'],
      ['names no language', JSON.stringify({ languages: {} })]
    ];

    namingNoLanguage.forEach(([file, config]) => {
      it(`asks for languages when the apimatic.json it adopts ${file}, and records the choice`, async () => {
        fs.writeFileSync(inSource('apimatic.json'), config);
        prompts.selectLanguages.resolves([Language.TYPESCRIPT]);
        sinon.stub(PortalArtifactsService.prototype, 'generate').resolves(ok(completeArtifacts([Language.TYPESCRIPT])));
        const prepare = sinon.stub(PortalProjectService.prototype, 'prepare').resolves(err('stopped here'));

        await execute(downloaded);

        expect(prompts.selectLanguages.calledOnce).to.be.true;
        const written = JSON.parse(fs.readFileSync(inSource('apimatic.json'), 'utf8'));
        expect(written.languages).to.deep.equal({ typescript: {} });
        expect(prepare.called, 'the wizard reached the preview').to.be.true;
      });
    });

    it('records no language, and stops, when none is chosen for the project it adopts', async () => {
      prompts.selectLanguages.resolves([]);

      expect((await execute(downloaded)).isCancelled()).to.be.true;
      expect(prompts.noLanguagesSelected.calledOnce).to.be.true;
      expect(JSON.parse(fs.readFileSync(inSource('apimatic.json'), 'utf8')).languages).to.be.undefined;
    });

    it('leaves a languages block of the wrong shape for the preview to report, writing nothing to it', async () => {
      fs.writeFileSync(inSource('apimatic.json'), JSON.stringify({ languages: { typescript: true } }));
      const sourceProblem = sinon.stub(PreparePortalProjectPrompts.prototype, 'sourceProblem');

      await execute(downloaded);

      expect(prompts.selectLanguages.called, 'asked for languages the project names').to.be.false;
      expect(prompts.configNotWritten.called, 'blamed a file it had no languages to write to').to.be.false;
      expect(JSON.parse(fs.readFileSync(inSource('apimatic.json'), 'utf8')).languages).to.deep.equal({
        typescript: true
      });
      expect(sourceProblem.calledOnce, 'the preview reported the block').to.be.true;
    });

    it('refuses an apimatic.json of a schema version it does not know before asking for languages', async () => {
      fs.writeFileSync(inSource('apimatic.json'), JSON.stringify({ schemaVersion: 2 }));

      expect((await execute(downloaded)).isFailed()).to.be.true;
      expect(prompts.scaffoldFailed.calledOnce).to.be.true;
      expect(prompts.selectLanguages.called).to.be.false;
    });

    it('leaves the plugin block an adopted project carries as it is', async () => {
      const config = JSON.stringify({
        portal: { site: { name: 'Our Docs' } },
        languages: { typescript: {} },
        plugin: { pluginName: 'Ours' }
      });
      fs.writeFileSync(inSource('apimatic.json'), config);
      sinon.stub(PortalArtifactsService.prototype, 'generate').resolves(ok(completeArtifacts([Language.TYPESCRIPT])));
      sinon.stub(PortalProjectService.prototype, 'prepare').resolves(err('stopped here'));

      await execute(downloaded);

      expect(fs.readFileSync(inSource('apimatic.json'), 'utf8')).to.equal(config);
    });

    it('refuses a project without apimatic.json before validating, and writes nothing', async () => {
      fs.rmSync(inSource('apimatic.json'));

      expect((await execute(downloaded)).isFailed()).to.be.true;
      expect(prompts.configMissing.calledOnce).to.be.true;
      expect(validateViaFile.called).to.be.false;
      expect(fs.readdirSync(inSource())).to.deep.equal(['spec']);
    });

    // Whatever `spec/` holds is the user's, so it is adopted, and fails as `api validate` would fail it.
    it('adopts a spec/ that holds no document rather than asking for one', async () => {
      fs.rmSync(inSource('spec', 'Apimatic-Calculator.json'));
      fs.writeFileSync(inSource('spec', 'README.md'), '# Specs');
      failValidation();

      expect((await execute(downloaded)).isCancelled()).to.be.true;
      expect(prompts.specPathPrompt.called).to.be.false;
      expect(prompts.specValidationFailed.calledOnceWith('project')).to.be.true;
    });

    // The validation service accepts Swagger 2.0, and the portal build does not.
    it('refuses a spec/ the portal cannot be built from, as the build does, before writing into it', async () => {
      fs.rmSync(inSource('spec', 'Apimatic-Calculator.json'));
      fs.writeFileSync(inSource('spec', 'petstore.json'), JSON.stringify({ swagger: '2.0', info: {}, paths: {} }));

      expect((await execute(downloaded)).isFailed()).to.be.true;
      expect(prompts.specsUnsupported.calledOnce).to.be.true;
      expect(prompts.specsUnsupported.firstCall.args[0].kind).to.equal('noOpenApiSpec');
      expect(fs.readFileSync(inSource('apimatic.json'), 'utf8')).to.equal('{}');
      expect(fs.existsSync(inSource('content'))).to.be.false;
    });

    it('validates all of spec/, not only the document the portal is built from', async () => {
      const zip = new FilePath(new DirectoryPath(root), new FileName('spec.zip'));
      const specZip = sinon.stub(ProjectContext.prototype, 'specZip').resolves(ok(zip));

      await execute(downloaded);

      expect(specZip.calledOnce).to.be.true;
      expect(specZip.firstCall.thisValue.isSourceDirectory(downloaded.join('src'))).to.be.true;
      expect(validateViaFile.firstCall.args[0].file).to.equal(zip);
    });

    it('names the project in the failure, so the fix it suggests validates all of spec/', async () => {
      failValidation();

      await execute(downloaded);

      expect(prompts.specValidationFailed.calledOnceWith('project')).to.be.true;
    });

    // The sample is written where the wizard is told to write, and an adopted `spec/` already
    // holds the document the portal would be built from. Offering it would promise a swap the
    // wizard cannot make.
    it('does not offer the sample when the specification it found fails validation', async () => {
      failValidation();

      expect((await execute(downloaded)).isCancelled()).to.be.true;
      expect(prompts.useDefaultSpecPrompt.called, 'offered to replace a specification it cannot replace').to.be.false;
      expect(prompts.fixYourSpec.calledOnce).to.be.true;
    });
  });

  // Shown with the failure, so it is in view while the user decides how to proceed.
  it('suggests validating the file the user gave in the failure, before asking how to proceed', async () => {
    failValidation();
    prompts.useDefaultSpecPrompt.resolves(false);

    expect((await execute()).isCancelled()).to.be.true;
    expect(prompts.specValidationFailed.calledOnceWith('file')).to.be.true;
    expect(prompts.specValidationFailed.calledBefore(prompts.useDefaultSpecPrompt)).to.be.true;
  });

  it('suggests validating a specification from a URL by its URL, not by its download', async () => {
    prompts.specPathPrompt.resolves(new UrlPath('https://example.com/openapi.json'));
    sinon.stub(FileDownloadService.prototype, 'downloadFile').resolves(downloadOf('openapi.json'));
    failValidation();
    prompts.useDefaultSpecPrompt.resolves(false);

    expect((await execute()).isCancelled()).to.be.true;
    expect(prompts.downloadSpecFile.calledOnce, 'downloaded under the spinner').to.be.true;
    expect(prompts.specValidationFailed.calledOnceWith('url')).to.be.true;
  });

  it('reads a local file without the download spinner', async () => {
    prompts.selectLanguages.resolves([]);

    await execute();

    expect(prompts.downloadSpecFile.called).to.be.false;
  });

  it('asks again for a file that does not exist, before validating anything', async () => {
    const missing = new FilePath(new DirectoryPath(root), new FileName('missing.json'));
    prompts.specPathPrompt.onFirstCall().resolves(missing);
    prompts.selectLanguages.resolves([]);

    await execute();

    expect(prompts.specUnavailable.calledOnceWith({ kind: 'fileUnreadable', file: missing })).to.be.true;
    expect(prompts.specPathPrompt.calledTwice).to.be.true;
    expect(validateViaFile.calledOnce).to.be.true;
  });

  it('asks again after a download fails, and stops offering the sample once it has failed', async () => {
    prompts.specPathPrompt.onFirstCall().callsFake(async (sample) => sample ?? undefined);
    sinon.stub(FileDownloadService.prototype, 'downloadFile').resolves(err(ServiceError.NetworkError));
    prompts.selectLanguages.resolves([]);

    await execute();

    const failed = prompts.specUnavailable.firstCall.args[0];
    expect(failed.kind === 'downloadFailed' && failed.url.isEqual(SAMPLE_URL)).to.be.true;
    expect(prompts.specPathPrompt.firstCall.args[0]?.isEqual(SAMPLE_URL)).to.be.true;
    expect(prompts.specPathPrompt.secondCall.args[0]).to.be.null;
  });

  it("keeps offering the sample after the user's own address fails", async () => {
    prompts.specPathPrompt.onFirstCall().resolves(new UrlPath('https://example.com/openapi.json'));
    sinon.stub(FileDownloadService.prototype, 'downloadFile').resolves(err(ServiceError.NetworkError));
    prompts.selectLanguages.resolves([]);

    await execute();

    expect(prompts.specPathPrompt.secondCall.args[0]?.isEqual(SAMPLE_URL)).to.be.true;
  });

  it('swaps in the sample, downloaded under the spinner, when the user asks for it', async () => {
    failValidation();
    prompts.useDefaultSpecPrompt.resolves(true);
    const download = sinon.stub(FileDownloadService.prototype, 'downloadFile').resolves(downloadOf('openapi.json'));
    prompts.selectLanguages.resolves([]);

    await execute();

    expect(download.calledOnce).to.be.true;
    expect(download.firstCall.args[0].isEqual(SAMPLE_URL)).to.be.true;
    expect(prompts.downloadSpecFile.calledOnce).to.be.true;
    expect(fs.readdirSync(path.join(projectDirectory.toString(), 'src', 'spec'))).to.deep.equal(['openapi.json']);
  });

  it('ends the wizard when the sample cannot be downloaded', async () => {
    failValidation();
    prompts.useDefaultSpecPrompt.resolves(true);
    sinon.stub(FileDownloadService.prototype, 'downloadFile').resolves(err(ServiceError.NetworkError));

    expect((await execute()).isFailed()).to.be.true;
    expect(prompts.specUnavailable.calledOnce).to.be.true;
    expect(prompts.projectDirectoryPrompt.called).to.be.false;
  });

  it('treats a document the validation service refuses outright as an invalid specification', async () => {
    validateViaFile.resolves(err({ kind: 'rejected', message: 'Your API Definition is invalid.' }));
    prompts.useDefaultSpecPrompt.resolves(false);

    expect((await execute()).isCancelled()).to.be.true;
    expect(prompts.specValidationFailed.calledOnceWith('file')).to.be.true;
  });

  it('treats a failed validation that carries no error as unchecked, never as a pass', async () => {
    failValidation();
    const failed = ActionResult.failed;
    sinon.stub(ActionResult, 'failed').callsFake((message?: string) => failed(message));

    expect((await execute()).isFailed()).to.be.true;
    expect(prompts.specValidationFailed.called).to.be.false;
    expect(prompts.projectDirectoryPrompt.called, 'went on to scaffold an unvalidated spec').to.be.false;
  });

  // The service's error is already shown, and the specification may be valid: there is nothing to fix.
  it('stops without calling the specification invalid when the validation service fails', async () => {
    validateViaFile.resolves(err({ kind: 'unavailable', message: 'Service unavailable' }));

    expect((await execute()).isFailed()).to.be.true;
    expect(prompts.specValidationFailed.called).to.be.false;
    expect(prompts.useDefaultSpecPrompt.called).to.be.false;
  });
});
