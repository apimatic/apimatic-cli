import * as path from 'path';
import { Readable } from 'node:stream';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginGenerateAction } from '../../../src/actions/plugin/generate.js';
import { PluginGeneratePrompts } from '../../../src/prompts/plugin/generate.js';
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
      sdkRepos: { csharp: { sourceCode: { srcCodeUrl: 'https://github.com/acme/acme-csharp' } } }
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
