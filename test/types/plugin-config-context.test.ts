import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { expect } from 'chai';
import { PluginConfigContext, PluginConfigState } from '../../src/types/plugin-config-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { PluginConfigData, PluginLanguages } from '../../src/types/plugin/plugin-config';
import { CodeGenerationVersion, Language } from '../../src/types/sdk/generate';

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

    it('says the file is empty rather than reporting a JSON syntax error', async () => {
      mockFs({ src: { 'plugin-config.json': '' } });

      const state = await context.loadState();

      expect(state).to.include({ state: 'unreadable', reason: 'it is empty' });
    });

    it('names the byte-order mark an editor left at the front of the file', async () => {
      mockFs({ src: { 'plugin-config.json': '﻿{ "languages": {} }' } });

      const state = await context.loadState();

      expect(state).to.include({
        state: 'unreadable',
        reason: 'it starts with a byte-order mark, which JSON does not allow'
      });
    });

    it('reports neither metadata nor languages for a bare file', async () => {
      withConfig({ languages: {} });

      const present = presentState(await context.loadState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.hasPublishedSdks()).to.be.false;
    });

    it('reports languages without metadata for a file written by sdk publish', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.loadState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.hasPublishedSdks()).to.be.true;
    });

    it('reports metadata without languages for a file written by plugin generate', async () => {
      withConfig({ ...METADATA, languages: {} });

      const present = presentState(await context.loadState());

      expect(present.hasMetadata()).to.be.true;
      expect(present.hasPublishedSdks()).to.be.false;
    });

    it('reports both once the config is complete', async () => {
      withConfig({ ...METADATA, languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.loadState());

      expect(present.hasMetadata()).to.be.true;
      expect(present.hasPublishedSdks()).to.be.true;
    });

    it('does not count a blank plugin id as metadata', async () => {
      withConfig({ pluginId: '   ', pluginName: 'Acme', languages: {} });

      expect(presentState(await context.loadState()).hasMetadata()).to.be.false;
    });
  });

  describe('upsertMetadata', () => {
    it('creates the file with the metadata and a default licence', async () => {
      mockFs({ src: {} });

      expect(await context.upsertMetadata(METADATA)).to.equal('written');
      expect(writtenConfig()).to.deep.equal({
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

    it('leaves an author the config already credits alone', async () => {
      withConfig({ author: { name: 'Acme Engineering' }, languages: {} });

      await context.upsertMetadata(METADATA, { name: 'Someone Else', email: 'someone@else.com' });

      expect(writtenConfig().author).to.deep.equal({ name: 'Acme Engineering' });
    });

    it('never writes a plugin key', async () => {
      mockFs({ src: {} });

      await context.upsertMetadata(METADATA);

      expect(writtenConfig()).to.not.have.property('pluginKey');
    });

    it('leaves a hand-written licence alone', async () => {
      withConfig({ license: 'Apache-2.0', languages: {} });

      await context.upsertMetadata(METADATA);

      expect(writtenConfig().license).to.equal('Apache-2.0');
    });

    it('adds metadata to a config sdk publish already created, keeping its languages', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      await context.upsertMetadata(METADATA);

      const config = writtenConfig();
      expect(config).to.include(METADATA);
      expect(config.languages).to.deep.equal({ csharp: CSHARP_ENTRY });
    });

    it('preserves fields this CLI version does not model', async () => {
      withConfig({ pluginKey: 'hand-written', homepage: 'https://acme.com', languages: {} });

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

  describe('upsertLanguage', () => {
    it('creates the file with no metadata at all', async () => {
      mockFs({ src: {} });

      expect(await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY)).to.equal('written');
      expect(writtenConfig()).to.deep.equal({
        languages: { csharp: CSHARP_ENTRY }
      });
    });

    it('adds a second language beside the first', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      const typescriptEntry = {
        source: { repositoryUrl: 'https://github.com/acme/acme-payments-typescript' },
        package: { name: '@acme/payments-sdk', version: '1.2.3' },
        codegenVersion: CodeGenerationVersion.V3
      } satisfies NonNullable<PluginLanguages['typescript']>;
      await context.upsertLanguage(Language.TYPESCRIPT, typescriptEntry);

      expect(writtenConfig().languages).to.deep.equal({ csharp: CSHARP_ENTRY, typescript: typescriptEntry });
    });

    it('replaces both halves when the run published both', async () => {
      withConfig({ languages: { csharp: { source: { repositoryUrl: 'https://old' } } } });

      await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY);

      expect(writtenConfig().languages).to.deep.equal({ csharp: CSHARP_ENTRY });
    });

    // One publish records one half, so dropping the other would point plugin generation at an
    // artifact that is still published.
    describe('keeps the half the run did not publish', () => {
      it('carries the recorded package over a source-only publish', async () => {
        withConfig({ languages: { csharp: CSHARP_ENTRY } });

        await context.upsertLanguage(Language.CSHARP, {
          source: { repositoryUrl: 'https://github.com/acme/renamed' },
          codegenVersion: CodeGenerationVersion.V3
        });

        expect(writtenConfig().languages.csharp).to.deep.equal({
          source: { repositoryUrl: 'https://github.com/acme/renamed' },
          package: CSHARP_ENTRY.package,
          codegenVersion: 'v3'
        });
      });

      it('carries the recorded source over a package-only publish', async () => {
        withConfig({ languages: { csharp: CSHARP_ENTRY } });

        await context.upsertLanguage(Language.CSHARP, {
          package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
          codegenVersion: CodeGenerationVersion.V3
        });

        expect(writtenConfig().languages.csharp).to.deep.equal({
          source: CSHARP_ENTRY.source,
          package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
          codegenVersion: 'v3'
        });
      });

      it('records the entry as it stands when the language is new to the config', async () => {
        withConfig({ languages: {} });

        await context.upsertLanguage(Language.CSHARP, {
          package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
          codegenVersion: CodeGenerationVersion.V3
        });

        expect(writtenConfig().languages.csharp).to.deep.equal({
          package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
          codegenVersion: 'v3'
        });
      });

      it('still takes the codegen version from the run that just published', async () => {
        withConfig({ languages: { csharp: CSHARP_ENTRY } });

        await context.upsertLanguage(Language.CSHARP, {
          package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
          codegenVersion: CodeGenerationVersion.V4
        });

        expect(writtenConfig().languages.csharp?.codegenVersion).to.equal('v4');
      });
    });

    it('leaves existing metadata untouched', async () => {
      withConfig({ ...METADATA, license: 'MIT', languages: {} });

      await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY);

      expect(writtenConfig()).to.include({ ...METADATA, license: 'MIT' });
    });

    it('refuses to overwrite a file it could not read', async () => {
      mockFs({ src: { 'plugin-config.json': '{ not json' } });

      expect(await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY)).to.equal('unreadable');
    });
  });
});
