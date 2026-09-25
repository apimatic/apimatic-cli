import * as path from 'path';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginGenerateAction } from '../../../src/actions/plugin/generate.js';
import { PluginGeneratePrompts } from '../../../src/prompts/plugin/generate.js';
import { PluginRecordMetadataPrompts } from '../../../src/prompts/plugin/record-metadata.js';
import { ApiService } from '../../../src/infrastructure/services/api-service.js';
import { SubscriptionInfo } from '../../../src/types/api/account.js';
import { PluginService } from '../../../src/infrastructure/services/plugin-service.js';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { ZipService } from '../../../src/infrastructure/zip-service.js';
import { FileService } from '../../../src/infrastructure/file-service.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { PublishingApiService } from '../../../src/infrastructure/services/publishing-api-service.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { Language } from '../../../src/types/sdk/generate.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'plugin generate', shell: 'test' };

describe('PluginGenerateAction', () => {
  let tmpDirResult: DirectoryResult;
  let sourceDirectory: string;
  let pluginDirectory: string;
  let action: PluginGenerateAction;

  let pluginArchive: Buffer;
  let selectLanguages: sinon.SinonStub;
  let canAsk: sinon.SinonStub;
  let getPublishingProfiles: sinon.SinonStub;
  /** Every file in the last zip handed to the service, by entry name. */
  let uploaded: Record<string, string>;

  /** What Notepad and PowerShell redirection leave at the front of a file, spelled out so it shows in a diff. */
  const BOM = String.fromCodePoint(0xfeff);

  const PLUGIN = { pluginId: 'acme-payments', pluginName: 'Acme Payments' };
  const LANGUAGES = { csharp: { publishing: { source: { repositoryUrl: 'https://github.com/acme/acme-csharp' } } } };

  const configPath = () => path.join(sourceDirectory, 'apimatic.json');
  const writeConfig = (config: object) => fsExtra.writeJson(configPath(), config);
  const writtenConfig = () => fsExtra.readJsonSync(configPath());

  /** The config the service actually reads: the copy, not the user's file. */
  const uploadedConfig = () => JSON.parse(uploaded['apimatic.json']);

  const project = () => ProjectContext.in(new DirectoryPath(path.dirname(sourceDirectory)));

  const execute = (force = false) => action.execute(project(), new DirectoryPath(pluginDirectory), force);

  // The action expands what the service returns, so the stubbed payload has to be a genuine zip.
  // The upload is read while the stub runs: the temporary directory it sits in is gone once the
  // action returns.
  const generated = () =>
    sinon.stub(PluginService.prototype, 'generatePlugin').callsFake(async (buildZipPath: FilePath) => {
      uploaded = Object.fromEntries(
        new AdmZip(buildZipPath.toString())
          .getEntries()
          .filter((entry) => !entry.isDirectory)
          .map((entry) => [entry.entryName, entry.getData().toString('utf-8')])
      );
      return ok(Readable.from([pluginArchive]));
    });

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    const workingDirectory = path.join(tmpDirResult.path, 'acme-payments');
    sourceDirectory = path.join(workingDirectory, 'src');
    pluginDirectory = path.join(workingDirectory, 'plugin');
    uploaded = {};
    const archiveSource = path.join(tmpDirResult.path, 'archive-source');
    await fsExtra.outputFile(path.join(archiveSource, 'README.md'), '# plugin');
    await fsExtra.outputFile(path.join(archiveSource, 'skills', 'SKILL.md'), '# skill');
    const archivePath = new FilePath(new DirectoryPath(tmpDirResult.path), new FileName('plugin.zip'));
    await new ZipService().archive(new DirectoryPath(archiveSource), archivePath);
    pluginArchive = await fsExtra.readFile(archivePath.toString());

    await fsExtra.ensureDir(sourceDirectory);
    await fsExtra.writeJson(path.join(sourceDirectory, 'APIMATIC-BUILD.json'), {});
    await writeConfig({ plugin: PLUGIN, languages: LANGUAGES });

    // The spinner would render to stdout; pass the underlying promise straight through.
    sinon.stub(PluginGeneratePrompts.prototype, 'generatePlugin').callsFake((fn) => fn);

    // The language prompt and the profile lookup sit on the paths that generate. Both default to
    // the quiet case — take what the config already names, no profile — so a test that is not
    // about either says nothing about them. Mocha runs without a terminal, which the prompt needs.
    selectLanguages = sinon
      .stub(PluginGeneratePrompts.prototype, 'selectLanguages')
      .callsFake(async (config) => [...config.initialLanguages()]);
    canAsk = sinon.stub(PluginGeneratePrompts.prototype, 'canAsk').returns(true);
    getPublishingProfiles = sinon.stub(PublishingApiService.prototype, 'getPublishingProfiles').resolves(ok([]));

    action = new PluginGenerateAction(new DirectoryPath(tmpDirResult.path), COMMAND_METADATA, 'auth-key');
  });

  afterEach(async () => {
    sinon.restore();
    await tmpDirResult.cleanup();
  });

  describe('input guards', () => {
    it('fails when the build and plugin directories are the same', async () => {
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');

      const result = await action.execute(project(), new DirectoryPath(sourceDirectory), false);

      expect(result.isFailed()).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });

    it('fails when the src directory does not exist', async () => {
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      await fsExtra.remove(sourceDirectory);

      expect((await execute()).isFailed()).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });

    it('generates without an APIMATIC-BUILD.json, which only portal and v3 SDK builds need', async () => {
      const generatePlugin = generated();
      await fsExtra.remove(path.join(sourceDirectory, 'APIMATIC-BUILD.json'));

      expect((await execute()).isSuccess()).to.be.true;
      expect(generatePlugin.called).to.be.true;
    });
  });

  describe('overwrite guard', () => {
    beforeEach(() => fsExtra.outputFile(path.join(pluginDirectory, 'stale.md'), 'from a previous run'));

    it('cancels when the destination is not empty and the user declines', async () => {
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      sinon.stub(PluginGeneratePrompts.prototype, 'overwritePlugin').resolves(false);

      expect((await execute()).isCancelled()).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });

    it('proceeds when the user accepts', async () => {
      generated();
      sinon.stub(PluginGeneratePrompts.prototype, 'overwritePlugin').resolves(true);

      expect((await execute()).isSuccess()).to.be.true;
    });

    it('never asks when --force is set', async () => {
      generated();
      const overwritePlugin = sinon.stub(PluginGeneratePrompts.prototype, 'overwritePlugin');

      expect((await execute(true)).isSuccess()).to.be.true;
      expect(overwritePlugin.called).to.be.false;
    });
  });

  describe('generation', () => {
    it('expands the downloaded artifact into the plugin directory', async () => {
      generated();

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(fsExtra.readFileSync(path.join(pluginDirectory, 'README.md'), 'utf-8')).to.equal('# plugin');
      expect(fsExtra.readFileSync(path.join(pluginDirectory, 'skills', 'SKILL.md'), 'utf-8')).to.equal('# skill');
      expect(fsExtra.existsSync(path.join(pluginDirectory, 'plugin.zip'))).to.be.false;
    });
  });

  // The server reads the plugin's identity and languages from the `apimatic.json` in the upload.
  describe('the upload', () => {
    it('is src as it stands, apimatic.json beside the build file', async () => {
      generated();

      await execute();

      expect(JSON.parse(uploaded['apimatic.json'])).to.deep.equal({ plugin: PLUGIN, languages: LANGUAGES });
      expect(uploaded).to.have.property('APIMATIC-BUILD.json');
    });

    it('synthesizes nothing: no plugin-config.json is written for the server', async () => {
      generated();

      await execute();

      expect(uploaded).to.not.have.property('plugin-config.json');
      expect(fsExtra.existsSync(path.join(sourceDirectory, 'plugin-config.json'))).to.be.false;
    });

    // The CLI reads past a mark an editor left at the front of the file, but the server parses
    // the file itself, so it must not travel with one. The user's own file is left as they saved
    // it, mark included: only the copy that is uploaded is rewritten.
    it('uploads no byte-order mark, and leaves the file as written', async () => {
      generated();
      const body =
        '{\r\n' +
        '\t"plugin": {"pluginId": "acme-payments", "pluginName": "Acme Payments"},\r\n' +
        '\t"languages": {"csharp": {"publishing": {"source": {"repositoryUrl": "https://github.com/acme/acme-csharp"}}}}\r\n' +
        '}\r\n';
      await fsExtra.writeFile(configPath(), BOM + body);

      expect((await execute()).isSuccess()).to.be.true;

      expect(uploaded['apimatic.json']).to.equal(body);
      expect(fsExtra.readFileSync(configPath(), 'utf-8')).to.equal(BOM + body);
    });

    it('fails rather than uploading a marked file it could not rewrite', async () => {
      const generatePlugin = generated();
      await fsExtra.writeFile(configPath(), BOM + JSON.stringify({ plugin: PLUGIN, languages: LANGUAGES }));
      sinon.stub(FileService.prototype, 'replaceContents').rejects(new Error('EACCES: permission denied'));

      expect((await execute()).isFailed()).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });
  });

  describe('plugin config', () => {
    const ACCOUNT = { FullName: 'Acme', Email: 'developers@acme.com' } as unknown as SubscriptionInfo;
    const METADATA = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };
    const CSHARP = { publishing: { source: { repositoryUrl: 'https://github.com/acme/acme-csharp' } } };

    // The real PluginRecordMetadataAction runs; only its prompts and the account call are stubbed,
    // so these assert what actually lands on disk.
    const answersMetadata = () =>
      sinon.stub(PluginRecordMetadataPrompts.prototype, 'inputPluginMetadata').resolves({ metadata: METADATA });
    const cancelsMetadata = (reason = 'A plugin ID is required') =>
      sinon.stub(PluginRecordMetadataPrompts.prototype, 'inputPluginMetadata').resolves({ cancelled: reason });

    beforeEach(() => {
      sinon.stub(PluginRecordMetadataPrompts.prototype, 'spinnerAccountInfo').callsFake((fn) => fn);
      sinon.stub(PluginRecordMetadataPrompts.prototype, 'metadataRecorded');
      sinon.stub(ApiService.prototype, 'getAccountInfo').resolves(ok(ACCOUNT));
    });

    it('fails without generating when the config cannot be read', async () => {
      await fsExtra.writeFile(configPath(), '{ not json');
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      const pluginConfigUnreadable = sinon.stub(PluginGeneratePrompts.prototype, 'pluginConfigUnreadable');

      expect((await execute()).isFailed()).to.be.true;
      expect(pluginConfigUnreadable.called).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });

    // The feature: a user with a spec, no publishing profile and no SDK anywhere gets a plugin.
    // This is the state that used to end in `success()` with nothing generated.
    it('creates the config and generates with nothing published and no SDK on disk', async () => {
      await fsExtra.remove(configPath());
      answersMetadata();
      selectLanguages.resolves([Language.CSHARP, Language.TYPESCRIPT]);
      const generatePlugin = generated();

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(writtenConfig().plugin).to.include(METADATA);
      expect(generatePlugin.called).to.be.true;
    });

    it('records a selected language as an empty entry, which is what asks for a bundled SDK', async () => {
      await writeConfig({ plugin: METADATA, languages: {} });
      selectLanguages.resolves([Language.CSHARP, Language.PYTHON]);
      generated();

      await execute();

      expect(writtenConfig().languages).to.deep.equal({ csharp: {}, python: {} });
    });

    it('fills in the plugin block and generates when sdk publish already recorded a language', async () => {
      await writeConfig({ languages: { csharp: CSHARP } });
      answersMetadata();
      const generatePlugin = generated();

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      const config = writtenConfig();
      expect(config.plugin).to.include(METADATA);
      expect(config.languages).to.deep.equal({ csharp: CSHARP });
      expect(generatePlugin.called).to.be.true;
    });

    // The published entry records where the SDK actually went; a selection may add to the file but
    // never edit what is recorded.
    it('leaves a published entry byte-identical while adding the languages selected beside it', async () => {
      await writeConfig({ languages: { csharp: CSHARP } });
      answersMetadata();
      selectLanguages.resolves([Language.CSHARP, Language.TYPESCRIPT]);
      generated();

      await execute();

      expect(writtenConfig().languages).to.deep.equal({ csharp: CSHARP, typescript: {} });
    });

    it('generates for a language recorded with neither a source nor a package', async () => {
      await writeConfig({ plugin: METADATA, languages: { csharp: {} } });
      const generatePlugin = generated();

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(generatePlugin.called).to.be.true;
    });

    // Asked while a project is being set up for a plugin: before its `plugin` block, or any language, is recorded.
    describe('language selection', () => {
      beforeEach(() => answersMetadata());

      it('generates from the languages a set-up project records, without asking, and says so', async () => {
        await writeConfig({ plugin: METADATA, languages: { csharp: CSHARP, python: {} } });
        const included = sinon.stub(PluginGeneratePrompts.prototype, 'recordedLanguagesIncluded');
        generated();

        expect((await execute()).isSuccess()).to.be.true;
        expect(selectLanguages.called).to.be.false;
        expect(included.calledOnceWith([Language.CSHARP, Language.PYTHON])).to.be.true;
        expect(Object.keys(uploadedConfig().languages)).to.deep.equal(['csharp', 'python']);
      });

      it('asks for the languages of a project without a plugin block', async () => {
        await writeConfig({ languages: { csharp: CSHARP } });
        generated();

        await execute();

        expect(selectLanguages.calledOnce).to.be.true;
      });

      it('asks when the plugin block is there but no language the plugin can carry is recorded', async () => {
        await writeConfig({ plugin: METADATA, languages: { java: {} } });
        generated();

        await execute();

        expect(selectLanguages.calledOnce).to.be.true;
      });

      // Otherwise Node ends the run with a warning about an unsettled await and nothing more.
      it('fails before asking anything when it has to ask and there is no terminal', async () => {
        await fsExtra.remove(configPath());
        canAsk.returns(false);
        const needsTerminal = sinon.stub(PluginGeneratePrompts.prototype, 'setupNeedsTerminal');
        const inputPluginMetadata = PluginRecordMetadataPrompts.prototype.inputPluginMetadata as sinon.SinonStub;
        const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');

        expect((await execute()).isFailed()).to.be.true;
        expect(needsTerminal.calledOnce).to.be.true;
        expect(inputPluginMetadata.called).to.be.false;
        expect(selectLanguages.called).to.be.false;
        expect(generatePlugin.called).to.be.false;
      });

      it('generates without a terminal for a project set up for a plugin', async () => {
        canAsk.returns(false);
        generated();

        expect((await execute()).isSuccess()).to.be.true;
      });

      // Which languages come up checked is the config's own rule — `initialLanguages`, covered in
      // plugin-config-context.test.ts. What this command owes the prompt is the config it read.
      it('hands the prompt the config it read', async () => {
        await writeConfig({ languages: { csharp: CSHARP } });
        generated();

        await execute();

        const [config] = selectLanguages.firstCall.args;
        expect(config.publishedLanguages()).to.deep.equal([Language.CSHARP]);
        expect(config.initialLanguages()).to.deep.equal([Language.CSHARP]);
      });

      // The entry records where the SDK went, and only `sdk publish` can write that again, so
      // clearing the checkbox leaves the file alone.
      it('keeps the record of a published language the user cleared', async () => {
        await writeConfig({ languages: { csharp: CSHARP } });
        selectLanguages.resolves([Language.TYPESCRIPT]);
        generated();

        await execute();

        expect(writtenConfig().languages).to.deep.equal({ csharp: CSHARP, typescript: {} });
      });

      // ...and the plugin still does not cover it. The service reads the uploaded copy, which
      // names exactly what was checked.
      it('leaves a cleared published language out of the upload', async () => {
        await writeConfig({ languages: { csharp: CSHARP } });
        selectLanguages.resolves([Language.TYPESCRIPT]);
        generated();

        await execute();

        expect(Object.keys(uploadedConfig().languages)).to.deep.equal(['typescript']);
      });

      // Clearing every box is an answer, not an empty one: nothing is generated, published or not.
      it('cancels when every language is cleared, even where one is published', async () => {
        await writeConfig({ languages: { csharp: CSHARP } });
        selectLanguages.resolves([]);
        const generatePlugin = generated();

        const result = await execute();

        expect(result.isCancelled()).to.be.true;
        expect(generatePlugin.called).to.be.false;
      });

      // The service reads the languages out of the zipped config, so a cleared checkbox that never
      // reaches the file is a checkbox that does nothing.
      it('drops an unpublished language the user cleared', async () => {
        await writeConfig({ languages: { csharp: {}, typescript: {} } });
        selectLanguages.resolves([Language.TYPESCRIPT]);
        generated();

        await execute();

        expect(writtenConfig().languages).to.deep.equal({ typescript: {} });
      });

      // The one way this command ends with no plugin, and the exit code is the point: `success()`
      // here is indistinguishable from a real generation to `&&`, to CI and to quickstart.
      it('cancels with 130 when nothing is selected', async () => {
        await writeConfig({ plugin: METADATA, languages: {} });
        selectLanguages.resolves([]);
        const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
        const noLanguages = sinon.stub(PluginGeneratePrompts.prototype, 'noLanguagesSelected');

        const result = await execute();

        expect(result.isCancelled()).to.be.true;
        expect(result.getExitCode()).to.equal(130);
        expect(noLanguages.called).to.be.true;
        expect(generatePlugin.called).to.be.false;
      });

      it('cancels with 130 when the prompt is escaped', async () => {
        await writeConfig({ languages: LANGUAGES });
        selectLanguages.resolves(undefined);
        const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
        sinon.stub(PluginGeneratePrompts.prototype, 'noLanguagesSelected');

        const result = await execute();

        expect(result.isCancelled()).to.be.true;
        expect(result.getExitCode()).to.equal(130);
        expect(generatePlugin.called).to.be.false;
      });

      // java, php and ruby have no v4 renderer, so the service drops them. The entry stays; the
      // omission is named, because nothing else would show it.
      it('names a language the plugin cannot include, and leaves its entry alone', async () => {
        const java = { publishing: { source: { repositoryUrl: 'https://github.com/acme/acme-java' } } };
        await writeConfig({ plugin: METADATA, languages: { csharp: CSHARP, java } });
        const notIncluded = sinon.stub(PluginGeneratePrompts.prototype, 'languagesNotIncluded');
        generated();

        await execute();

        expect(notIncluded.calledOnceWith(['java'])).to.be.true;
        expect(writtenConfig().languages.java).to.deep.equal(java);
      });
    });

    describe('publishing profile', () => {
      // `sdk publish`'s own test of a usable profile: one with nothing enabled can publish
      // nothing, so it is not a profile as far as the recommendation is concerned.
      const hasProfile = () =>
        getPublishingProfiles.resolves(
          ok([{ id: 'profile-1', cSharpGitConfiguration: { isEnabled: true, repositoryName: 'acme/acme-csharp' } }])
        );

      const stubProfilePrompts = () => ({
        confirm: sinon.stub(PluginGeneratePrompts.prototype, 'confirmLocalPlugin').resolves(true),
        preview: sinon.stub(PluginGeneratePrompts.prototype, 'previewOnly')
      });

      it('recommends publishing first, then generates when the user continues', async () => {
        await writeConfig({ plugin: METADATA, languages: {} });
        selectLanguages.resolves([Language.CSHARP]);
        hasProfile();
        const prompts = stubProfilePrompts();
        const generatePlugin = generated();

        const result = await execute();

        expect(result.isSuccess()).to.be.true;
        expect(prompts.confirm.called).to.be.true;
        expect(generatePlugin.called).to.be.true;
        expect(prompts.preview.called).to.be.true;
      });

      // A profile with no language enabled cannot publish anything, so recommending it would send
      // the user to a command that refuses them.
      it('says nothing when the only profile has no language enabled', async () => {
        await writeConfig({ plugin: METADATA, languages: {} });
        selectLanguages.resolves([Language.CSHARP]);
        getPublishingProfiles.resolves(ok([{ id: 'profile-1' }]));
        const prompts = stubProfilePrompts();
        const generatePlugin = generated();

        expect((await execute()).isSuccess()).to.be.true;
        expect(prompts.confirm.called).to.be.false;
        expect(prompts.preview.called).to.be.false;
        expect(generatePlugin.called).to.be.true;
      });

      it('cancels without generating when the user declines', async () => {
        await writeConfig({ plugin: METADATA, languages: {} });
        selectLanguages.resolves([Language.CSHARP]);
        hasProfile();
        const prompts = stubProfilePrompts();
        prompts.confirm.resolves(false);
        sinon.stub(PluginGeneratePrompts.prototype, 'localPluginCancelled');
        const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');

        const result = await execute();

        expect(result.isCancelled()).to.be.true;
        expect(generatePlugin.called).to.be.false;
        // A run the user stopped may not leave the file claiming a language they never got.
        expect(writtenConfig().languages).to.deep.equal({});
      });

      // A user without a profile cannot act on "publish for production", so the run ends at the
      // install instructions rather than on a caveat they cannot clear.
      it('says nothing about publishing, and no preview note, when there is no profile', async () => {
        await writeConfig({ plugin: METADATA, languages: {} });
        selectLanguages.resolves([Language.CSHARP]);
        const prompts = stubProfilePrompts();
        generated();

        expect((await execute()).isSuccess()).to.be.true;
        expect(prompts.confirm.called).to.be.false;
        expect(prompts.preview.called).to.be.false;
      });

      // Nothing is asked of a project set up for a plugin, so the recommendation stands on its own.
      it('recommends publishing first without asking when the languages come from the config', async () => {
        await writeConfig({ plugin: METADATA, languages: { csharp: {} } });
        hasProfile();
        const prompts = stubProfilePrompts();
        const recommended = sinon.stub(PluginGeneratePrompts.prototype, 'publishFirstRecommended');
        const generatePlugin = generated();

        expect((await execute()).isSuccess()).to.be.true;
        expect(prompts.confirm.called).to.be.false;
        expect(recommended.calledOnce).to.be.true;
        expect(prompts.preview.called).to.be.true;
        expect(generatePlugin.called).to.be.true;
      });

      // Having a profile is not the trigger; building something local is. Every selected language
      // is already published here, so there is nothing preview about the result.
      it('says nothing when every selected language is already published', async () => {
        await writeConfig({ plugin: METADATA, languages: { csharp: CSHARP } });
        hasProfile();
        const prompts = stubProfilePrompts();
        generated();

        expect((await execute()).isSuccess()).to.be.true;
        expect(prompts.confirm.called).to.be.false;
        expect(prompts.preview.called).to.be.false;
      });

      // Advisory only: a lookup that cannot answer must not fail a generation the user asked for.
      it('generates without the recommendation when the lookup fails', async () => {
        await writeConfig({ plugin: METADATA, languages: {} });
        selectLanguages.resolves([Language.CSHARP]);
        getPublishingProfiles.resolves(err(ServiceError.ServerError));
        const prompts = stubProfilePrompts();
        const generatePlugin = generated();

        expect((await execute()).isSuccess()).to.be.true;
        expect(prompts.confirm.called).to.be.false;
        expect(generatePlugin.called).to.be.true;
      });
    });

    it('cancels without generating when the metadata prompts are escaped', async () => {
      await fsExtra.remove(configPath());
      cancelsMetadata();
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      const metadataCancelled = sinon.stub(PluginRecordMetadataPrompts.prototype, 'metadataCancelled');

      const result = await execute();

      expect(result.isCancelled()).to.be.true;
      expect(metadataCancelled.called).to.be.true;
      expect(generatePlugin.called).to.be.false;
      expect(fsExtra.existsSync(configPath())).to.be.false;
    });

    it('reports the answer that was actually missing, not always the plugin id', async () => {
      await fsExtra.remove(configPath());
      cancelsMetadata('A plugin version is required');
      sinon.stub(PluginService.prototype, 'generatePlugin');
      const metadataCancelled = sinon.stub(PluginRecordMetadataPrompts.prototype, 'metadataCancelled');

      await execute();

      expect(metadataCancelled.firstCall.args[0]).to.equal('A plugin version is required');
    });

    it('generates straight away when the config is already complete', async () => {
      const inputPluginMetadata = answersMetadata();
      generated();

      expect((await execute()).isSuccess()).to.be.true;
      expect(inputPluginMetadata.called).to.be.false;
    });
  });

  describe('generation failures', () => {
    it('falls back to the plain service message for any other failure', async () => {
      sinon.stub(PluginService.prototype, 'generatePlugin').resolves(err(ServiceError.ServerError));
      const pluginGenerationError = sinon.stub(PluginGeneratePrompts.prototype, 'pluginGenerationError');

      expect((await execute()).isFailed()).to.be.true;
      expect(pluginGenerationError.called).to.be.true;
    });

    it('reports every message the response carries, whatever key it arrived under', async () => {
      // The service assembles one message from every key, so no key can be dropped for
      // being one the CLI does not recognise.
      const error = ServiceError.badRequest('One or more validation errors occurred.\n- a\n- b', {
        pluginConfig: ['a'],
        someKeyTheCliDoesNotKnow: ['b']
      });
      sinon.stub(PluginService.prototype, 'generatePlugin').resolves(err(error));
      const pluginGenerationError = sinon.stub(PluginGeneratePrompts.prototype, 'pluginGenerationError');

      expect((await execute()).isFailed()).to.be.true;
      expect(pluginGenerationError.firstCall.args[0]).to.equal('One or more validation errors occurred.\n- a\n- b');
    });
  });
});
