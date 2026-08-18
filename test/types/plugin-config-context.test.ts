import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { expect } from 'chai';
import { PluginConfigContext, PluginConfigState } from '../../src/types/plugin-config-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { PluginConfigData, PluginLanguages } from '../../src/types/plugin/plugin-config';
import { CodeGenerationVersion } from '../../src/types/sdk/generate';

describe('PluginConfigContext', () => {
  const buildDirectory = new DirectoryPath('src');
  const context = new PluginConfigContext(buildDirectory);

  const CSHARP_ENTRY = {
    source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
    package: { packageId: 'Acme.Payments.Sdk', version: '1.2.3' },
    codegenVersion: CodeGenerationVersion.V3
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const METADATA = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };

  const writtenConfig = (): PluginConfigData =>
    JSON.parse(fs.readFileSync(path.join(buildDirectory.toString(), 'plugin-config.json'), 'utf-8'));

  const withConfig = (config: object) => mockFs({ src: { 'plugin-config.json': JSON.stringify(config) } });

  afterEach(() => mockFs.restore());

  describe('loadState', () => {
    const presentState = (state: PluginConfigState) => {
      if (state.state !== 'present') {
        expect.fail(`expected a present config, got ${state.state}`);
      }
      return state;
    };

    it('is missing when there is no file', async () => {
      mockFs({ src: {} });

      expect(await context.loadState()).to.deep.equal({ state: 'missing' });
    });

    it('is unreadable when the file is not valid JSON', async () => {
      mockFs({ src: { 'plugin-config.json': '{ not json' } });

      const state = await context.loadState();

      expect(state.state).to.equal('unreadable');
    });

    it('is unreadable when the file is a JSON array', async () => {
      mockFs({ src: { 'plugin-config.json': '[]' } });

      const state = await context.loadState();

      expect(state).to.include({ state: 'unreadable', reason: 'it is not a JSON object' });
    });

    it('is unreadable when the file declares a schema version this CLI does not model', async () => {
      withConfig({ schemaVersion: 2, languages: {} });

      const state = await context.loadState();

      expect(state.state).to.equal('unreadable');
      expect((state as { reason: string }).reason).to.contain('schemaVersion 2');
    });

    it('reports neither metadata nor languages for a bare file', async () => {
      withConfig({ schemaVersion: 1, languages: {} });

      const present = presentState(await context.loadState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.hasPublishedSdks()).to.be.false;
    });

    it('reports languages without metadata for a file written by sdk publish', async () => {
      withConfig({ schemaVersion: 1, languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.loadState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.hasPublishedSdks()).to.be.true;
    });

    it('reports metadata without languages for a file written by plugin generate', async () => {
      withConfig({ schemaVersion: 1, ...METADATA, languages: {} });

      const present = presentState(await context.loadState());

      expect(present.hasMetadata()).to.be.true;
      expect(present.hasPublishedSdks()).to.be.false;
    });

    it('reports both once the config is complete', async () => {
      withConfig({ schemaVersion: 1, ...METADATA, languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.loadState());

      expect(present.hasMetadata()).to.be.true;
      expect(present.hasPublishedSdks()).to.be.true;
    });

    it('does not count a blank plugin id as metadata', async () => {
      withConfig({ schemaVersion: 1, pluginId: '   ', pluginName: 'Acme', languages: {} });

      expect(presentState(await context.loadState()).hasMetadata()).to.be.false;
    });
  });

  describe('upsertMetadata', () => {
    it('creates the file with schema version, metadata and a default licence', async () => {
      mockFs({ src: {} });

      expect(await context.upsertMetadata(METADATA)).to.equal('written');
      expect(writtenConfig()).to.deep.equal({
        schemaVersion: 1,
        languages: {},
        ...METADATA,
        license: 'MIT'
      });
    });

    it('records the author when one is supplied', async () => {
      mockFs({ src: {} });

      await context.upsertMetadata(METADATA, { name: 'Acme', email: 'developers@acme.com' });

      expect(writtenConfig().author).to.deep.equal({ name: 'Acme', email: 'developers@acme.com' });
    });

    it('never writes a plugin key', async () => {
      mockFs({ src: {} });

      await context.upsertMetadata(METADATA);

      expect(writtenConfig()).to.not.have.property('pluginKey');
    });

    it('leaves a hand-written licence alone', async () => {
      withConfig({ schemaVersion: 1, license: 'Apache-2.0', languages: {} });

      await context.upsertMetadata(METADATA);

      expect(writtenConfig().license).to.equal('Apache-2.0');
    });

    it('adds metadata to a config sdk publish already created, keeping its languages', async () => {
      withConfig({ schemaVersion: 1, languages: { csharp: CSHARP_ENTRY } });

      await context.upsertMetadata(METADATA);

      const config = writtenConfig();
      expect(config).to.include(METADATA);
      expect(config.languages).to.deep.equal({ csharp: CSHARP_ENTRY });
    });

    it('preserves fields this CLI version does not model', async () => {
      withConfig({ schemaVersion: 1, pluginKey: 'hand-written', homepage: 'https://acme.com', languages: {} });

      await context.upsertMetadata(METADATA);

      const config = writtenConfig();
      expect(config.pluginKey).to.equal('hand-written');
      expect(config.homepage).to.equal('https://acme.com');
    });

    it('refuses to overwrite a file it could not read', async () => {
      mockFs({ src: { 'plugin-config.json': '{ not json' } });

      expect(await context.upsertMetadata(METADATA)).to.equal('unreadable');
      expect(fs.readFileSync(path.join('src', 'plugin-config.json'), 'utf-8')).to.equal('{ not json');
    });
  });

  describe('schemaVersion', () => {
    it('backfills it into a hand-written file that omits it', async () => {
      mockFs({ src: { 'plugin-config.json': JSON.stringify({ languages: {} }) } });

      await context.upsertMetadata(METADATA);

      expect(writtenConfig().schemaVersion).to.equal(1);
    });
  });

  describe('upsertLanguages', () => {
    it('creates the file with no metadata at all', async () => {
      mockFs({ src: {} });

      expect(await context.upsertLanguages({ csharp: CSHARP_ENTRY })).to.equal('written');
      expect(writtenConfig()).to.deep.equal({
        schemaVersion: 1,
        languages: { csharp: CSHARP_ENTRY }
      });
    });

    it('adds a second language beside the first', async () => {
      withConfig({ schemaVersion: 1, languages: { csharp: CSHARP_ENTRY } });

      const typescriptEntry = {
        source: { repositoryUrl: 'https://github.com/acme/acme-payments-typescript' },
        package: { name: '@acme/payments-sdk', version: '1.2.3' },
        codegenVersion: CodeGenerationVersion.V3
      } satisfies NonNullable<PluginLanguages['typescript']>;
      await context.upsertLanguages({ typescript: typescriptEntry });

      expect(writtenConfig().languages).to.deep.equal({ csharp: CSHARP_ENTRY, typescript: typescriptEntry });
    });

    it('replaces an entry for a language already recorded', async () => {
      withConfig({ schemaVersion: 1, languages: { csharp: { source: { repositoryUrl: 'https://old' } } } });

      await context.upsertLanguages({ csharp: CSHARP_ENTRY });

      expect(writtenConfig().languages).to.deep.equal({ csharp: CSHARP_ENTRY });
    });

    it('leaves existing metadata untouched', async () => {
      withConfig({ schemaVersion: 1, ...METADATA, license: 'MIT', languages: {} });

      await context.upsertLanguages({ csharp: CSHARP_ENTRY });

      expect(writtenConfig()).to.include({ ...METADATA, license: 'MIT' });
    });

    it('refuses to overwrite a file it could not read', async () => {
      mockFs({ src: { 'plugin-config.json': '{ not json' } });

      expect(await context.upsertLanguages({ csharp: CSHARP_ENTRY })).to.equal('unreadable');
    });
  });
});
