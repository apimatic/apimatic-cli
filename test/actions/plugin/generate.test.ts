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
import { Language } from '../../../src/types/sdk/generate.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'plugin generate', shell: 'test' };

describe('PluginGenerateAction', () => {
  let tmpDirResult: DirectoryResult;
  let buildDirectory: string;
  let pluginDirectory: string;
  let action: PluginGenerateAction;

  let pluginArchive: Buffer;
  let selectLanguages: sinon.SinonStub;
  let getPublishingProfiles: sinon.SinonStub;
  /** Every file in the last zip handed to the service, by entry name. */
  let uploaded: Record<string, string>;

  /** What Notepad and PowerShell redirection leave at the front of a file, spelled out so it shows in a diff. */
  const BOM = String.fromCodePoint(0xfeff);

  const PLUGIN = { pluginId: 'acme-payments', pluginName: 'Acme Payments' };
  const LANGUAGES = { csharp: { publishing: { source: { repositoryUrl: 'https://github.com/acme/acme-csharp' } } } };

  const configPath = () => path.join(buildDirectory, 'apimatic.json');
  const writeConfig = (config: object) => fsExtra.writeJson(configPath(), config);
  const writtenConfig = () => fsExtra.readJsonSync(configPath());

  const execute = (force = false) =>
    action.execute(new DirectoryPath(buildDirectory), new DirectoryPath(pluginDirectory), force);

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
    buildDirectory = path.join(workingDirectory, 'src');
    pluginDirectory = path.join(workingDirectory, 'plugin');
    uploaded = {};
    const archiveSource = path.join(tmpDirResult.path, 'archive-source');
    await fsExtra.outputFile(path.join(archiveSource, 'README.md'), '# plugin');
    await fsExtra.outputFile(path.join(archiveSource, 'skills', 'SKILL.md'), '# skill');
    const archivePath = new FilePath(new DirectoryPath(tmpDirResult.path), new FileName('plugin.zip'));
    await new ZipService().archive(new DirectoryPath(archiveSource), archivePath);
    pluginArchive = await fsExtra.readFile(archivePath.toString());

    await fsExtra.ensureDir(buildDirectory);
    await fsExtra.writeJson(path.join(buildDirectory, 'APIMATIC-BUILD.json'), {});
    await writeConfig({ plugin: PLUGIN, languages: LANGUAGES });

    // The spinner would render to stdout; pass the underlying promise straight through.
    sinon.stub(PluginGeneratePrompts.prototype, 'generatePlugin').callsFake((fn) => fn);

    // The language prompt and the profile lookup sit on every path that generates. Both default
    // to the quiet case — take what the config already names, no profile — so a test that is not
    // about either says nothing about them.
    selectLanguages = sinon
      .stub(PluginGeneratePrompts.prototype, 'selectLanguages')
      .callsFake(async (config) => [...config.initialLanguages()]);
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

      const result = await action.execute(new DirectoryPath(buildDirectory), new DirectoryPath(buildDirectory), false);

      expect(result.isFailed()).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });

    it('fails when the src directory does not exist', async () => {
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      await fsExtra.remove(buildDirectory);

      expect((await execute()).isFailed()).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });

    it('generates without an APIMATIC-BUILD.json, which only portal and v3 SDK builds need', async () => {
      const generatePlugin = generated();
      await fsExtra.remove(path.join(buildDirectory, 'APIMATIC-BUILD.json'));

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
      expect(fsExtra.existsSync(path.join(buildDirectory, 'plugin-config.json'))).to.be.false;
    });

    // The CLI reads past a mark an editor left at the front of the file, but the server parses
    // the file itself, so it must not travel with one. Nothing else about the file changes.
    it('carries no byte-order mark, and the rest of the file as written', async () => {
      generated();
      const body =
        '{\r\n' +
        '\t"plugin": {"pluginId": "acme-payments", "pluginName": "Acme Payments"},\r\n' +
        '\t"languages": {"csharp": {"publishing": {"source": {"repositoryUrl": "https://github.com/acme/acme-csharp"}}}}\r\n' +
        '}\r\n';
      await fsExtra.writeFile(configPath(), BOM + body);

      expect((await execute()).isSuccess()).to.be.true;

      expect(uploaded['apimatic.json']).to.equal(body);
      expect(fsExtra.readFileSync(configPath(), 'utf-8')).to.equal(body);
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
      await writeConfig({ plugin: METADATA, languages: { csharp: CSHARP } });
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

    describe('language selection', () => {
      // Which languages come up checked is the config's own rule — `initialLanguages`, covered in
      // plugin-config-context.test.ts. What this command owes the prompt is the config it read.
      it('hands the prompt the config it read', async () => {
        await writeConfig({ plugin: METADATA, languages: { csharp: CSHARP } });
        generated();

        await execute();

        const [config] = selectLanguages.firstCall.args;
        expect(config.publishedLanguages()).to.deep.equal([Language.CSHARP]);
        expect(config.initialLanguages()).to.deep.equal([Language.CSHARP]);
      });

      // The entry is the record of where the SDK went, so a selection cannot take it out of the
      // file. The prompt puts a cleared published language back and says so; this is the other
      // half of that promise — even a selection that arrives without it leaves the entry alone.
      it('never drops a language the config already names', async () => {
        await writeConfig({ plugin: METADATA, languages: { csharp: CSHARP } });
        selectLanguages.resolves([Language.TYPESCRIPT]);
        generated();

        await execute();

        expect(writtenConfig().languages).to.deep.equal({ csharp: CSHARP, typescript: {} });
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
      const hasProfile = () => getPublishingProfiles.resolves(ok([{ id: 'profile-1' }]));

      const stubProfilePrompts = () => ({
        recommend: sinon.stub(PluginGeneratePrompts.prototype, 'recommendPublishingFirst'),
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
        expect(prompts.recommend.calledBefore(prompts.confirm)).to.be.true;
        expect(generatePlugin.called).to.be.true;
        expect(prompts.preview.called).to.be.true;
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
      });

      // A user without a profile cannot act on "publish for production", so the run ends at the
      // install instructions rather than on a caveat they cannot clear.
      it('says nothing about publishing, and no preview note, when there is no profile', async () => {
        await writeConfig({ plugin: METADATA, languages: {} });
        selectLanguages.resolves([Language.CSHARP]);
        const prompts = stubProfilePrompts();
        generated();

        expect((await execute()).isSuccess()).to.be.true;
        expect(prompts.recommend.called).to.be.false;
        expect(prompts.confirm.called).to.be.false;
        expect(prompts.preview.called).to.be.false;
      });

      // Having a profile is not the trigger; building something local is. Every selected language
      // is already published here, so there is nothing preview about the result.
      it('says nothing when every selected language is already published', async () => {
        await writeConfig({ plugin: METADATA, languages: { csharp: CSHARP } });
        hasProfile();
        const prompts = stubProfilePrompts();
        generated();

        expect((await execute()).isSuccess()).to.be.true;
        expect(prompts.recommend.called).to.be.false;
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
        expect(prompts.recommend.called).to.be.false;
        expect(generatePlugin.called).to.be.true;
      });
    });

    it('cancels without generating when the metadata prompts are escaped', async () => {
      await fsExtra.remove(configPath());
      cancelsMetadata();
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      const metadataCancelled = sinon.stub(PluginGeneratePrompts.prototype, 'metadataCancelled');

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
      const metadataCancelled = sinon.stub(PluginGeneratePrompts.prototype, 'metadataCancelled');

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
