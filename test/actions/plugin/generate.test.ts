import * as path from 'path';
import { Readable } from 'node:stream';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginGenerateAction } from '../../../src/actions/plugin/generate.js';
import { PluginGeneratePrompts } from '../../../src/prompts/plugin/generate.js';
import { PluginCreateConfigPrompts } from '../../../src/prompts/plugin/create-config.js';
import { ApiService } from '../../../src/infrastructure/services/api-service.js';
import { SubscriptionInfo } from '../../../src/types/api/account.js';
import { PluginService } from '../../../src/infrastructure/services/plugin-service.js';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'plugin generate', shell: 'test' };

describe('PluginGenerateAction', () => {
  let tmpDirResult: DirectoryResult;
  let buildDirectory: string;
  let pluginDirectory: string;
  let action: PluginGenerateAction;

  const execute = (force = false, zipPlugin = true) =>
    action.execute(new DirectoryPath(buildDirectory), new DirectoryPath(pluginDirectory), force, zipPlugin);

  const generated = () =>
    sinon.stub(PluginService.prototype, 'generatePlugin').resolves(ok(Readable.from(['PK context-plugin'])));

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    const workingDirectory = path.join(tmpDirResult.path, 'acme-payments');
    buildDirectory = path.join(workingDirectory, 'src');
    pluginDirectory = path.join(workingDirectory, 'plugin');
    await fsExtra.ensureDir(buildDirectory);
    await fsExtra.writeJson(path.join(buildDirectory, 'APIMATIC-BUILD.json'), {});
    await fsExtra.writeJson(path.join(buildDirectory, 'plugin-config.json'), {
      schemaVersion: 1,
      pluginId: 'acme-payments',
      pluginName: 'Acme Payments',
      languages: { csharp: { source: { repositoryUrl: 'https://github.com/acme/acme-csharp' } } }
    });

    // The spinner would render to stdout; pass the underlying promise straight through.
    sinon.stub(PluginGeneratePrompts.prototype, 'generatePlugin').callsFake((fn) => fn);

    action = new PluginGenerateAction(new DirectoryPath(tmpDirResult.path), COMMAND_METADATA, 'auth-key');
  });

  afterEach(async () => {
    sinon.restore();
    await tmpDirResult.cleanup();
  });

  describe('input guards', () => {
    it('fails when the build and plugin directories are the same', async () => {
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');

      const result = await action.execute(
        new DirectoryPath(buildDirectory),
        new DirectoryPath(buildDirectory),
        false,
        true
      );

      expect(result.isFailed()).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });

    it('fails when the build directory has no APIMATIC-BUILD.json', async () => {
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      await fsExtra.remove(path.join(buildDirectory, 'APIMATIC-BUILD.json'));

      expect((await execute()).isFailed()).to.be.true;
      expect(generatePlugin.called).to.be.false;
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
    it('saves the downloaded artifact into the plugin directory', async () => {
      generated();

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(fsExtra.readFileSync(path.join(pluginDirectory, 'plugin.zip'), 'utf-8')).to.equal('PK context-plugin');
    });
  });

  describe('plugin config', () => {
    const ACCOUNT = { FullName: 'Acme', Email: 'developers@acme.com' } as unknown as SubscriptionInfo;
    const METADATA = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };
    const CSHARP = { source: { repositoryUrl: 'https://github.com/acme/acme-csharp' } };

    const configPath = () => path.join(buildDirectory, 'plugin-config.json');
    const writeConfig = (config: object) => fsExtra.writeJson(configPath(), config);
    const writtenConfig = () => fsExtra.readJsonSync(configPath());

    // The real PluginCreateConfigAction runs; only its prompts and the account call are stubbed,
    // so these assert what actually lands on disk.
    const answersMetadata = () =>
      sinon.stub(PluginCreateConfigPrompts.prototype, 'inputPluginMetadata').resolves({ metadata: METADATA });
    const cancelsMetadata = (reason = 'A plugin ID is required') =>
      sinon.stub(PluginCreateConfigPrompts.prototype, 'inputPluginMetadata').resolves({ cancelled: reason });

    beforeEach(() => {
      sinon.stub(PluginCreateConfigPrompts.prototype, 'spinnerAccountInfo').callsFake((fn) => fn);
      sinon.stub(PluginCreateConfigPrompts.prototype, 'pluginConfigCreated');
      sinon.stub(ApiService.prototype, 'getAccountInfo').resolves(ok(ACCOUNT));
      sinon.stub(PluginGeneratePrompts.prototype, 'noPublishedSdks');
      sinon.stub(PluginGeneratePrompts.prototype, 'nextStepsPublishSdks');
    });

    it('fails without generating when the config cannot be read', async () => {
      await fsExtra.writeFile(configPath(), '{ not json');
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      const pluginConfigUnreadable = sinon.stub(PluginGeneratePrompts.prototype, 'pluginConfigUnreadable');

      expect((await execute()).isFailed()).to.be.true;
      expect(pluginConfigUnreadable.called).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });

    it('creates the config, then stops with next steps when no SDK is recorded', async () => {
      await fsExtra.remove(configPath());
      answersMetadata();
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      const nextSteps = PluginGeneratePrompts.prototype.nextStepsPublishSdks as sinon.SinonStub;

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(writtenConfig()).to.include(METADATA);
      expect(nextSteps.called).to.be.true;
      expect(generatePlugin.called).to.be.false;
    });

    it('fills in metadata and generates when sdk publish already recorded a language', async () => {
      await writeConfig({ schemaVersion: 1, languages: { csharp: CSHARP } });
      answersMetadata();
      generated();

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      const config = writtenConfig();
      expect(config).to.include(METADATA);
      expect(config.languages).to.deep.equal({ csharp: CSHARP });
    });

    it('stops with next steps when the config has metadata but no languages', async () => {
      await writeConfig({ schemaVersion: 1, ...METADATA, languages: {} });
      const generatePlugin = sinon.stub(PluginService.prototype, 'generatePlugin');
      const inputPluginMetadata = answersMetadata();

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(generatePlugin.called).to.be.false;
      expect(inputPluginMetadata.called).to.be.false;
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
