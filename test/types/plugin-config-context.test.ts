import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { expect } from 'chai';
import { PluginConfigContext } from '../../src/types/plugin-config-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { LanguageEntry, PluginConfigData } from '../../src/types/plugin/plugin-config';
import { CodeGenerationVersion, Language } from '../../src/types/sdk/generate';

describe('PluginConfigContext', () => {
  const buildDirectory = new DirectoryPath('src');
  const context = new PluginConfigContext(buildDirectory);

  const CSHARP_ENTRY: LanguageEntry = {
    source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
    package: { packageId: 'Acme.Payments.Sdk' },
    version: CodeGenerationVersion.V3
  };

  const METADATA = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };

  // `pluginKey` is the account's API Copilot key, resolved before the write and always recorded.
  const PLUGIN_KEY = 'copilot-key-1';

  const writtenConfig = (): PluginConfigData =>
    JSON.parse(fs.readFileSync(path.join(buildDirectory.toString(), 'plugin-config.json'), 'utf-8'));

  const withConfig = (config: object) => mockFs({ src: { 'plugin-config.json': JSON.stringify(config) } });

  afterEach(() => mockFs.restore());

  describe('validate', () => {
    it('is missing when there is no file', async () => {
      mockFs({ src: {} });

      expect(await context.validate()).to.deep.equal({ state: 'missing' });
    });

    it('is unreadable when the file is not valid JSON', async () => {
      mockFs({ src: { 'plugin-config.json': '{ not json' } });

      const state = await context.validate();

      expect(state.state).to.equal('unreadable');
    });

    it('is unreadable when the file is a JSON array', async () => {
      mockFs({ src: { 'plugin-config.json': '[]' } });

      const state = await context.validate();

      expect(state).to.include({ state: 'unreadable', reason: 'it is not a JSON object' });
    });

    it('is unreadable when the file declares a schema version this CLI does not model', async () => {
      withConfig({ schemaVersion: 2, languages: {} });

      const state = await context.validate();

      expect(state.state).to.equal('unreadable');
      expect((state as { reason: string }).reason).to.contain('schemaVersion 2');
    });

    it('reports neither metadata nor languages for a bare file', async () => {
      withConfig({ schemaVersion: 1, languages: {} });

      expect(await context.validate()).to.deep.equal({
        state: 'present',
        hasMetadata: false,
        hasLanguages: false
      });
    });

    it('reports languages without metadata for a file written by sdk publish', async () => {
      withConfig({ schemaVersion: 1, languages: { csharp: CSHARP_ENTRY } });

      expect(await context.validate()).to.deep.equal({
        state: 'present',
        hasMetadata: false,
        hasLanguages: true
      });
    });

    it('reports metadata without languages for a file written by plugin generate', async () => {
      withConfig({ schemaVersion: 1, ...METADATA, languages: {} });

      expect(await context.validate()).to.deep.equal({
        state: 'present',
        hasMetadata: true,
        hasLanguages: false
      });
    });

    it('reports both once the config is complete', async () => {
      withConfig({ schemaVersion: 1, ...METADATA, languages: { csharp: CSHARP_ENTRY } });

      expect(await context.validate()).to.deep.equal({
        state: 'present',
        hasMetadata: true,
        hasLanguages: true
      });
    });

    it('does not count a blank plugin id as metadata', async () => {
      withConfig({ schemaVersion: 1, pluginId: '   ', pluginName: 'Acme', languages: {} });

      expect(await context.validate()).to.include({ hasMetadata: false });
    });
  });

  describe('upsertMetadata', () => {
    it('creates the file with schema version, metadata, plugin key and a default licence', async () => {
      mockFs({ src: {} });

      expect(await context.upsertMetadata(METADATA, PLUGIN_KEY)).to.equal('written');
      expect(writtenConfig()).to.deep.equal({
        schemaVersion: 1,
        languages: {},
        ...METADATA,
        pluginKey: PLUGIN_KEY,
        license: 'MIT'
      });
    });

    it('records the author when one is supplied', async () => {
      mockFs({ src: {} });

      await context.upsertMetadata(METADATA, PLUGIN_KEY, { name: 'Acme', email: 'developers@acme.com' });

      expect(writtenConfig().author).to.deep.equal({ name: 'Acme', email: 'developers@acme.com' });
    });

    // Nothing outside the file identifies the plugin except this key, so a write without one would
    // produce a config that cannot be attributed to a copilot.
    it('always writes the plugin key', async () => {
      mockFs({ src: {} });

      await context.upsertMetadata(METADATA, PLUGIN_KEY);

      expect(writtenConfig().pluginKey).to.equal(PLUGIN_KEY);
    });

    it('replaces a plugin key already on disk with the one just resolved', async () => {
      withConfig({ schemaVersion: 1, pluginKey: 'stale-key', languages: {} });

      await context.upsertMetadata(METADATA, PLUGIN_KEY);

      expect(writtenConfig().pluginKey).to.equal(PLUGIN_KEY);
    });

    it('leaves a hand-written licence alone', async () => {
      withConfig({ schemaVersion: 1, license: 'Apache-2.0', languages: {} });

      await context.upsertMetadata(METADATA, PLUGIN_KEY);

      expect(writtenConfig().license).to.equal('Apache-2.0');
    });

    it('adds metadata to a config sdk publish already created, keeping its languages', async () => {
      withConfig({ schemaVersion: 1, languages: { csharp: CSHARP_ENTRY } });

      await context.upsertMetadata(METADATA, PLUGIN_KEY);

      const config = writtenConfig();
      expect(config).to.include(METADATA);
      expect(config.languages).to.deep.equal({ csharp: CSHARP_ENTRY });
    });

    it('preserves fields this CLI version does not model', async () => {
      withConfig({
        schemaVersion: 1,
        homepage: 'https://acme.com',
        repository: 'https://github.com/acme/sdk',
        languages: {}
      });

      await context.upsertMetadata(METADATA, PLUGIN_KEY);

      const config = writtenConfig();
      expect(config.homepage).to.equal('https://acme.com');
      expect(config.repository).to.equal('https://github.com/acme/sdk');
    });

    it('refuses to overwrite a file it could not read', async () => {
      mockFs({ src: { 'plugin-config.json': '{ not json' } });

      expect(await context.upsertMetadata(METADATA, PLUGIN_KEY)).to.equal('unreadable');
      expect(fs.readFileSync(path.join('src', 'plugin-config.json'), 'utf-8')).to.equal('{ not json');
    });
  });

  describe('schemaVersion', () => {
    it('backfills it into a hand-written file that omits it', async () => {
      mockFs({ src: { 'plugin-config.json': JSON.stringify({ languages: {} }) } });

      await context.upsertMetadata(METADATA, PLUGIN_KEY);

      expect(writtenConfig().schemaVersion).to.equal(1);
    });
  });

  describe('upsertLanguage', () => {
    it('creates the file with no metadata at all', async () => {
      mockFs({ src: {} });

      expect(await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY)).to.equal('written');
      expect(writtenConfig()).to.deep.equal({
        schemaVersion: 1,
        languages: { csharp: CSHARP_ENTRY }
      });
    });

    it('adds a second language beside the first', async () => {
      withConfig({ schemaVersion: 1, languages: { csharp: CSHARP_ENTRY } });

      const typescriptEntry: LanguageEntry = {
        source: { repositoryUrl: 'https://github.com/acme/acme-payments-typescript' },
        package: { name: '@acme/payments-sdk' }
      };
      await context.upsertLanguage(Language.TYPESCRIPT, typescriptEntry);

      expect(writtenConfig().languages).to.deep.equal({ csharp: CSHARP_ENTRY, typescript: typescriptEntry });
    });

    it('replaces an entry for a language already recorded', async () => {
      withConfig({ schemaVersion: 1, languages: { csharp: { source: { repositoryUrl: 'https://old' } } } });

      await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY);

      expect(writtenConfig().languages).to.deep.equal({ csharp: CSHARP_ENTRY });
    });

    it('leaves existing metadata untouched', async () => {
      withConfig({ schemaVersion: 1, ...METADATA, license: 'MIT', languages: {} });

      await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY);

      expect(writtenConfig()).to.include({ ...METADATA, license: 'MIT' });
    });

    it('refuses to overwrite a file it could not read', async () => {
      mockFs({ src: { 'plugin-config.json': '{ not json' } });

      expect(await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY)).to.equal('unreadable');
    });
  });
});
