import * as path from 'path';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginPublishAction } from '../../../src/actions/plugin/publish.js';
import { PluginPublishPrompts } from '../../../src/prompts/plugin/publish.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PluginContents } from '../../../src/types/plugin/plugin-contents.js';
import { PluginReleaseData } from '../../../src/types/plugin-config-context.js';

describe('PluginPublishAction', () => {
  let tmpDirResult: DirectoryResult;
  let buildDirectory: string;
  let pluginDirectory: string;
  let action: PluginPublishAction;

  const execute = (plugin = pluginDirectory) =>
    action.execute(new DirectoryPath(buildDirectory), new DirectoryPath(plugin));

  const configPath = () => path.join(buildDirectory, 'apimatic.json');
  const writeConfig = (config: unknown) => fsExtra.writeJson(configPath(), config);

  const IDENTITY = { pluginId: 'hamza', pluginName: 'Hamza Plugin', pluginVersion: '0.1.67' };
  const LANGUAGES = { csharp: { source: { repositoryUrl: 'https://github.com/acme/acme-csharp' } } };
  const validConfig = { plugin: IDENTITY, languages: LANGUAGES };

  const spy = (method: keyof PluginPublishPrompts) => sinon.spy(PluginPublishPrompts.prototype, method);

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    const workingDirectory = path.join(tmpDirResult.path, 'acme-payments');
    buildDirectory = path.join(workingDirectory, 'src');
    pluginDirectory = path.join(workingDirectory, 'plugin');

    await fsExtra.ensureDir(buildDirectory);
    await writeConfig(validConfig);

    await fsExtra.ensureDir(path.join(pluginDirectory, 'skills', 'auth'));
    await fsExtra.writeFile(path.join(pluginDirectory, 'README.md'), '# plugin');
    await fsExtra.writeJson(path.join(pluginDirectory, 'plugin.json'), {});
    await fsExtra.writeFile(path.join(pluginDirectory, 'skills', 'auth', 'SKILL.md'), '# skill');

    action = new PluginPublishAction();
  });

  afterEach(async () => {
    sinon.restore();
    await tmpDirResult.cleanup();
  });

  describe('input validation', () => {
    it('refuses to publish the build directory itself', async () => {
      const prompt = spy('directoryCannotBeSame');

      const result = await execute(buildDirectory);

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    it('fails when the plugin directory does not exist', async () => {
      const prompt = spy('pluginNotGenerated');
      await fsExtra.remove(pluginDirectory);

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    it('fails when the plugin directory is empty', async () => {
      const prompt = spy('pluginNotGenerated');
      await fsExtra.emptyDir(pluginDirectory);

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    // The `.git` that `plugin generate` now preserves must not read as a publishable plugin.
    it('fails when the plugin directory holds nothing but a repository', async () => {
      const prompt = spy('pluginNotGenerated');
      await fsExtra.emptyDir(pluginDirectory);
      await fsExtra.ensureDir(path.join(pluginDirectory, '.git'));

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });
  });

  describe('apimatic.json', () => {
    it('fails when the file is absent', async () => {
      const prompt = spy('pluginConfigMissing');
      await fsExtra.remove(configPath());

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    it('fails when the file cannot be parsed', async () => {
      const prompt = spy('pluginConfigUnreadable');
      await fsExtra.writeFile(configPath(), '{ nope');

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    it('asks for the plugin details when the id is absent', async () => {
      const prompt = spy('pluginDetailsNotSet');
      await writeConfig({ ...validConfig, plugin: { ...IDENTITY, pluginId: undefined } });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    it('asks for the plugin details when the version is absent', async () => {
      const prompt = spy('pluginDetailsNotSet');
      await writeConfig({ ...validConfig, plugin: { ...IDENTITY, pluginVersion: undefined } });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    // It exists, so saying it was not found would be false; it is the details that are missing.
    it('asks for the plugin details when the file carries no plugin block at all', async () => {
      const prompt = spy('pluginDetailsNotSet');
      await writeConfig({ languages: LANGUAGES });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    it('refuses the file when the id is not kebab-case', async () => {
      const prompt = spy('pluginConfigUnreadable');
      await writeConfig({ ...validConfig, plugin: { ...IDENTITY, pluginId: 'Hamza Plugin' } });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.firstCall.args[0]).to.contain(`'plugin.pluginId'`);
    });

    it('refuses the file when the version is not semver', async () => {
      const prompt = spy('pluginConfigUnreadable');
      await writeConfig({ ...validConfig, plugin: { ...IDENTITY, pluginVersion: '1.2' } });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.firstCall.args[0]).to.contain(`'plugin.pluginVersion'`);
    });

    it('publishes without a display name, which it never reads', async () => {
      const prompt = spy('firstPublishInstructions');
      await writeConfig({ ...validConfig, plugin: { ...IDENTITY, pluginName: undefined } });

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    it('publishes past a malformed portal block, which is not its to read', async () => {
      const prompt = spy('firstPublishInstructions');
      await writeConfig({ ...validConfig, portal: 'not a portal' });

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });
  });

  describe('choosing the instructions', () => {
    it('prints the first-publish commands when there is no repository yet', async () => {
      const firstPublish = spy('firstPublishInstructions');
      const update = spy('updateInstructions');

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(firstPublish.calledOnce).to.be.true;
      expect(update.called).to.be.false;
    });

    it('prints the update commands when the plugin directory is already a repository', async () => {
      const firstPublish = spy('firstPublishInstructions');
      const update = spy('updateInstructions');
      await fsExtra.ensureDir(path.join(pluginDirectory, '.git'));

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(update.calledOnce).to.be.true;
      expect(firstPublish.called).to.be.false;
    });

    it('passes the release read from the config', async () => {
      const prompt = spy('firstPublishInstructions');

      await execute();

      const release = prompt.firstCall.args[0] as PluginReleaseData;
      expect(release.pluginId).to.equal('hamza');
      expect(`${release.version}`).to.equal('0.1.67');
    });

    it('counts the plugin contents recursively', async () => {
      const prompt = spy('firstPublishInstructions');

      await execute();

      const contents = prompt.firstCall.args[1] as PluginContents;
      expect(contents).to.deep.equal({ fileCount: 3, directoryCount: 2 });
    });

    it('leaves the repository out of the counts', async () => {
      const prompt = spy('updateInstructions');
      await fsExtra.ensureDir(path.join(pluginDirectory, '.git', 'refs', 'tags'));
      await fsExtra.writeFile(path.join(pluginDirectory, '.git', 'HEAD'), 'ref: refs/heads/main');

      await execute();

      const contents = prompt.firstCall.args[1] as PluginContents;
      expect(contents).to.deep.equal({ fileCount: 3, directoryCount: 2 });
    });
  });
});
