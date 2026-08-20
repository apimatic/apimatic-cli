import * as path from 'path';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginPublishAction } from '../../../src/actions/plugin/publish.js';
import { PluginPublishPrompts } from '../../../src/prompts/plugin/publish.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PluginContents } from '../../../src/types/plugin/plugin-contents.js';
import { PluginRelease } from '../../../src/types/plugin/plugin-release.js';

describe('PluginPublishAction', () => {
  let tmpDirResult: DirectoryResult;
  let buildDirectory: string;
  let pluginDirectory: string;
  let action: PluginPublishAction;

  const execute = (plugin = pluginDirectory) =>
    action.execute(new DirectoryPath(buildDirectory), new DirectoryPath(plugin));

  const writeConfig = (config: unknown) => fsExtra.writeJson(path.join(buildDirectory, 'plugin-config.json'), config);

  const validConfig = {
    pluginId: 'hamza',
    pluginName: 'Hamza Plugin',
    pluginVersion: '0.1.67',
    languages: { csharp: { source: { repositoryUrl: 'https://github.com/acme/acme-csharp' } } }
  };

  const spy = (method: keyof PluginPublishPrompts) => sinon.spy(PluginPublishPrompts.prototype, method);

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    const workingDirectory = path.join(tmpDirResult.path, 'acme-payments');
    buildDirectory = path.join(workingDirectory, 'src');
    pluginDirectory = path.join(workingDirectory, 'plugin');

    await fsExtra.ensureDir(buildDirectory);
    await writeConfig(validConfig);

    // A generated plugin: two files at the root, one nested a level down.
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

  describe('plugin-config.json', () => {
    it('fails when the file is absent', async () => {
      const prompt = spy('pluginConfigMissing');
      await fsExtra.remove(path.join(buildDirectory, 'plugin-config.json'));

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    it('fails when the file cannot be parsed', async () => {
      const prompt = spy('pluginConfigUnreadable');
      await fsExtra.writeFile(path.join(buildDirectory, 'plugin-config.json'), '{ nope');

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.calledOnce).to.be.true;
    });

    it('fails and names pluginId when the id is absent', async () => {
      const prompt = spy('pluginReleaseUnusable');
      await writeConfig({ ...validConfig, pluginId: undefined });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.firstCall.args[0]).to.deep.equal({ field: 'pluginId', reason: 'missing' });
    });

    it('fails and names pluginId when the id is not kebab-case', async () => {
      const prompt = spy('pluginReleaseUnusable');
      await writeConfig({ ...validConfig, pluginId: 'Hamza Plugin' });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.firstCall.args[0]).to.deep.equal({ field: 'pluginId', reason: 'malformed' });
    });

    // `hasMetadata` does not cover the version, so this is the only guard on the field the tag needs.
    it('fails and names pluginVersion when the version is absent', async () => {
      const prompt = spy('pluginReleaseUnusable');
      await writeConfig({ ...validConfig, pluginVersion: undefined });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.firstCall.args[0]).to.deep.equal({ field: 'pluginVersion', reason: 'missing' });
    });

    it('fails and names pluginVersion when the version is not semver', async () => {
      const prompt = spy('pluginReleaseUnusable');
      await writeConfig({ ...validConfig, pluginVersion: '1.2' });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompt.firstCall.args[0]).to.deep.equal({ field: 'pluginVersion', reason: 'malformed' });
    });

    it('publishes without a display name, which it never reads', async () => {
      const prompt = spy('firstPublishInstructions');
      await writeConfig({ ...validConfig, pluginName: undefined });

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

      const release = prompt.firstCall.args[0] as PluginRelease;
      expect(release.toRepositoryName()).to.equal('hamza');
      expect(release.toTag()).to.equal('v0.1.67');
    });

    it('counts the plugin contents recursively', async () => {
      const prompt = spy('firstPublishInstructions');

      await execute();

      const contents = prompt.firstCall.args[1] as PluginContents;
      expect(contents).to.deep.equal({ fileCount: 3, directoryCount: 2 });
    });

    // `git add .` never stages `.git`, so counting it would inflate the figure by every git object.
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
