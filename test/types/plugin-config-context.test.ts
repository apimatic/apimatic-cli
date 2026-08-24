import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { expect } from 'chai';
import { PluginConfigContext, PluginConfigState } from '../../src/types/plugin-config-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { PluginConfigData, PluginLanguageEntry, PluginLanguages } from '../../src/types/plugin/plugin-config';
import { CodeGenerationVersion, Language } from '../../src/types/sdk/generate';

describe('PluginConfigContext', () => {
  const buildDirectory = new DirectoryPath('src');
  const context = new PluginConfigContext(buildDirectory);

  const CSHARP_ENTRY = {
    source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
    package: { packageId: 'Acme.Payments.Sdk', version: '1.2.3' },
    codegenVersion: CodeGenerationVersion.V3
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const SOURCE_ONLY_ENTRY = {
    source: CSHARP_ENTRY.source,
    codegenVersion: CSHARP_ENTRY.codegenVersion
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const PACKAGE_ONLY_ENTRY = {
    package: CSHARP_ENTRY.package,
    codegenVersion: CSHARP_ENTRY.codegenVersion
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const UNPUBLISHED_ENTRY = {
    codegenVersion: CSHARP_ENTRY.codegenVersion
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const METADATA = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };

  const writtenConfig = (): PluginConfigData =>
    JSON.parse(fs.readFileSync(path.join(buildDirectory.toString(), 'plugin-config.json'), 'utf-8'));

  const withConfig = (config: object) => mockFs({ src: { 'plugin-config.json': JSON.stringify(config) } });

  afterEach(() => mockFs.restore());

  describe('getPluginConfigState', () => {
    const presentState = (state: PluginConfigState) => {
      if (state.state !== 'present') {
        expect.fail(`expected a present config, got ${state.state}`);
      }
      return state;
    };

    it('is missing when there is no file', async () => {
      mockFs({ src: {} });

      expect(await context.getPluginConfigState()).to.deep.equal({ state: 'missing' });
    });

    it('is unreadable when the file is not valid JSON', async () => {
      mockFs({ src: { 'plugin-config.json': '{ not json' } });

      const state = await context.getPluginConfigState();

      expect(state.state).to.equal('unreadable');
    });

    it('is unreadable when the file is a JSON array', async () => {
      mockFs({ src: { 'plugin-config.json': '[]' } });

      const state = await context.getPluginConfigState();

      expect(state).to.include({ state: 'unreadable', reason: 'it is not a JSON object' });
    });

    it('says the file is empty rather than reporting a JSON syntax error', async () => {
      mockFs({ src: { 'plugin-config.json': '' } });

      const state = await context.getPluginConfigState();

      expect(state).to.include({ state: 'unreadable', reason: 'it is empty' });
    });

    it('names the byte-order mark an editor left at the front of the file', async () => {
      mockFs({ src: { 'plugin-config.json': '﻿{ "languages": {} }' } });

      const state = await context.getPluginConfigState();

      expect(state).to.include({
        state: 'unreadable',
        reason: 'it starts with a byte-order mark, which JSON does not allow'
      });
    });

    it('names the languages field when it is not a JSON object', async () => {
      withConfig({ languages: 'csharp' });

      const state = await context.getPluginConfigState();

      expect(state).to.include({ state: 'unreadable', reason: `its 'languages' field is not a JSON object` });
    });

    it('names the language whose entry is not a JSON object', async () => {
      withConfig({ languages: { csharp: 'v3' } });

      const state = await context.getPluginConfigState();

      expect(state).to.include({ state: 'unreadable', reason: `its 'languages.csharp' entry is not a JSON object` });
    });

    const reasonOf = async (config: object) => {
      withConfig(config);
      const state = await context.getPluginConfigState();
      expect(state).to.include({ state: 'unreadable' });
      return (state as { reason: string }).reason;
    };

    const releaseOf = async (config: object) => {
      withConfig(config);
      return presentState(await context.getPluginConfigState()).getRelease();
    };

    ['Acme Payments', 'acme_payments', 'Acme-Payments', 'acme--payments', '-acme', 'acme-'].forEach((pluginId) => {
      it(`names pluginId when it is '${pluginId}'`, async () => {
        expect(await reasonOf({ ...METADATA, pluginId, languages: {} })).to.contain(`'pluginId'`);
      });
    });

    ['1.2', '1.2.3.4', 'v1.2.3', '1.2.x', 'latest'].forEach((pluginVersion) => {
      it(`names pluginVersion when it is '${pluginVersion}'`, async () => {
        expect(await reasonOf({ ...METADATA, pluginVersion, languages: {} })).to.contain(`'pluginVersion'`);
      });
    });

    // A hand-edited field is worth reporting even when the other one has yet to be written.
    it('names a malformed pluginId whose version is not set yet', async () => {
      expect(await reasonOf({ pluginId: 'Acme Payments', languages: {} })).to.contain(`'pluginId'`);
    });

    it('names a malformed pluginVersion whose id is not set yet', async () => {
      expect(await reasonOf({ pluginVersion: '1.2', languages: {} })).to.contain(`'pluginVersion'`);
    });

    it('reports the release once the identity is recorded', async () => {
      const release = await releaseOf({ ...METADATA, languages: {} });

      expect(release?.pluginId).to.equal('acme-payments');
      expect(`${release?.version}`).to.equal('0.1.0');
    });

    it('refuses an identity padded with whitespace', async () => {
      expect(await reasonOf({ pluginId: '  acme-payments  ', pluginVersion: '0.1.0', languages: {} })).to.contain(
        `'pluginId'`
      );
      expect(await reasonOf({ pluginId: 'acme-payments', pluginVersion: '  0.1.0  ', languages: {} })).to.contain(
        `'pluginVersion'`
      );
    });

    [
      ['no id', { pluginVersion: '1.0.0' }],
      ['no version', { pluginId: 'acme-payments' }],
      ['neither field, as sdk publish writes it', { languages: { csharp: CSHARP_ENTRY } }]
    ].forEach(([label, config]) => {
      it(`reports no release for ${label}`, async () => {
        expect(await releaseOf({ languages: {}, ...(config as object) })).to.be.undefined;
      });
    });

    // A field written as blank can only be hand-edited, so it is refused rather than read as absent.
    it('refuses a blank id', async () => {
      expect(await reasonOf({ pluginId: '   ', pluginVersion: '1.0.0', languages: {} })).to.contain(`'pluginId'`);
    });

    it('refuses a blank version', async () => {
      expect(await reasonOf({ pluginId: 'acme-payments', pluginVersion: '  ', languages: {} })).to.contain(
        `'pluginVersion'`
      );
    });

    it('reports no release for an id that is not a string', async () => {
      expect(await releaseOf({ pluginId: 7, pluginVersion: '1.0.0', languages: {} })).to.be.undefined;
    });

    it('accepts a config carrying no languages field at all', async () => {
      withConfig({ ...METADATA });

      const state = await context.getPluginConfigState();

      expect(presentState(state).hasPublishedSdks()).to.be.false;
    });

    it('reports neither metadata nor languages for a bare file', async () => {
      withConfig({ languages: {} });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.hasPublishedSdks()).to.be.false;
    });

    it('reports languages without metadata for a file written by sdk publish', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.hasPublishedSdks()).to.be.true;
    });

    it('reports metadata without languages for a file written by plugin generate', async () => {
      withConfig({ ...METADATA, languages: {} });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.true;
      expect(present.hasPublishedSdks()).to.be.false;
    });

    it('reports both once the config is complete', async () => {
      withConfig({ ...METADATA, languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.true;
      expect(present.hasPublishedSdks()).to.be.true;
    });

    it('does not count a language recorded with neither a source nor a package', async () => {
      withConfig({ languages: { csharp: UNPUBLISHED_ENTRY } });

      expect(presentState(await context.getPluginConfigState()).hasPublishedSdks()).to.be.false;
    });

    it('counts a language published as source only', async () => {
      withConfig({ languages: { csharp: SOURCE_ONLY_ENTRY } });

      expect(presentState(await context.getPluginConfigState()).hasPublishedSdks()).to.be.true;
    });

    it('counts a language published as package only', async () => {
      withConfig({ languages: { csharp: PACKAGE_ONLY_ENTRY } });

      expect(presentState(await context.getPluginConfigState()).hasPublishedSdks()).to.be.true;
    });

    it('counts a published language recorded alongside one with neither half', async () => {
      withConfig({
        languages: {
          csharp: UNPUBLISHED_ENTRY,
          typescript: { package: { name: '@acme/sdk', version: '1.2.3' }, codegenVersion: CodeGenerationVersion.V3 }
        }
      });

      expect(presentState(await context.getPluginConfigState()).hasPublishedSdks()).to.be.true;
    });

    it('refuses a blank plugin id before metadata is considered', async () => {
      withConfig({ pluginId: '   ', pluginName: 'Acme', languages: {} });

      expect(await context.getPluginConfigState()).to.include({ state: 'unreadable' });
    });

    it('does not count a plugin id that is not a string as metadata', async () => {
      withConfig({ pluginId: 7, pluginName: 'Acme', languages: {} });

      expect(presentState(await context.getPluginConfigState()).hasMetadata()).to.be.false;
    });

    it('reports a recorded source repository for the language', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasNoSourceRepository(Language.CSHARP)).to.be.false;
      expect(present.hasNoSourceRepository(Language.JAVA)).to.be.true;
    });

    it('reports no source repository for an entry carrying only a package', async () => {
      withConfig({ languages: { csharp: { package: CSHARP_ENTRY.package, codegenVersion: 'v3' } } });

      expect(presentState(await context.getPluginConfigState()).hasNoSourceRepository(Language.CSHARP)).to.be.true;
    });
  });

  describe('assertNoCodegenVersionMismatch', () => {
    const PUBLISHED_SOURCE = {
      source: CSHARP_ENTRY.source,
      codegenVersion: CodeGenerationVersion.V3
    } satisfies PluginLanguageEntry<Language.CSHARP>;

    const PUBLISHED_PACKAGE = {
      package: CSHARP_ENTRY.package,
      codegenVersion: CodeGenerationVersion.V3
    } satisfies PluginLanguageEntry<Language.CSHARP>;

    const assertFor = async (
      languages: object,
      published: PluginLanguageEntry<Language.CSHARP>,
      codegenVersion = CodeGenerationVersion.V3
    ) => {
      withConfig({ languages });
      const state = await context.getPluginConfigState();
      if (state.state !== 'present') {
        expect.fail(`expected a present config, got ${state.state}`);
      }
      return state.assertNoCodegenVersionMismatch(codegenVersion, Language.CSHARP, published);
    };

    it('passes when the run republishes both halves, whatever the config records', async () => {
      const result = await assertFor({ csharp: CSHARP_ENTRY }, CSHARP_ENTRY, CodeGenerationVersion.V4);

      expect(result.isOk()).to.be.true;
    });

    it('reports the recorded version alongside the published one when a package-only run leaves a source behind', async () => {
      const recorded = { source: CSHARP_ENTRY.source, codegenVersion: CodeGenerationVersion.V3 };

      const result = await assertFor({ csharp: recorded }, PUBLISHED_PACKAGE, CodeGenerationVersion.V4);

      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr()).to.deep.equal({
        expected: CodeGenerationVersion.V4,
        actual: CodeGenerationVersion.V3
      });
    });

    it('reports the mismatch when a source-only run leaves a package behind', async () => {
      const recorded = { package: CSHARP_ENTRY.package, codegenVersion: CodeGenerationVersion.V3 };

      const result = await assertFor({ csharp: recorded }, PUBLISHED_SOURCE, CodeGenerationVersion.V4);

      expect(result.isErr()).to.be.true;
    });

    it('passes when the recorded version is the one being published', async () => {
      const recorded = { source: CSHARP_ENTRY.source, codegenVersion: CodeGenerationVersion.V3 };

      expect((await assertFor({ csharp: recorded }, PUBLISHED_PACKAGE)).isOk()).to.be.true;
    });

    it('passes for a language the config does not carry', async () => {
      const result = await assertFor({ java: CSHARP_ENTRY }, PUBLISHED_PACKAGE, CodeGenerationVersion.V4);

      expect(result.isOk()).to.be.true;
    });

    it('passes when the recorded entry has no half to carry over', async () => {
      const recorded = { codegenVersion: CodeGenerationVersion.V3 };

      expect((await assertFor({ csharp: recorded }, PUBLISHED_PACKAGE, CodeGenerationVersion.V4)).isOk()).to.be.true;
    });

    it('passes when the recorded entry records no version', async () => {
      const recorded = { source: { repositoryUrl: 'https://github.com/acme/sdk' } };

      expect((await assertFor({ csharp: recorded }, PUBLISHED_PACKAGE, CodeGenerationVersion.V4)).isOk()).to.be.true;
    });

  });

  describe('upsertMetadata', () => {
    it('creates the file with the metadata and a default licence', async () => {
      mockFs({ src: {} });

      expect((await context.upsertMetadata(METADATA)).isOk()).to.be.true;
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

      expect((await context.upsertMetadata(METADATA))._unsafeUnwrapErr()).to.equal('unreadable');
      expect(fs.readFileSync(path.join('src', 'plugin-config.json'), 'utf-8')).to.equal('{ not json');
    });
  });

  describe('the state a write hands back', () => {
    it('reports the metadata it just wrote', async () => {
      mockFs({ src: {} });

      const state = (await context.upsertMetadata(METADATA))._unsafeUnwrap();

      expect(state.hasMetadata()).to.be.true;
      expect(state.hasPublishedSdks()).to.be.false;
    });

    it('reports the language it just wrote, alongside metadata written earlier', async () => {
      mockFs({ src: { 'plugin-config.json': JSON.stringify({ ...METADATA, languages: {} }) } });

      const state = (await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY))._unsafeUnwrap();

      expect(state.hasPublishedSdks()).to.be.true;
      expect(state.hasMetadata()).to.be.true;
      expect(state.hasNoSourceRepository(Language.CSHARP)).to.be.false;
    });
  });

  describe('upsertLanguage', () => {
    it('creates the file with no metadata at all', async () => {
      mockFs({ src: {} });

      expect((await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY)).isOk()).to.be.true;
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

    it('refuses a languages field it cannot merge rather than spreading it into the file', async () => {
      const original = JSON.stringify({ languages: 'csharp' });
      mockFs({ src: { 'plugin-config.json': original } });

      expect((await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY))._unsafeUnwrapErr()).to.equal('unreadable');
      expect(fs.readFileSync(path.join('src', 'plugin-config.json'), 'utf-8')).to.equal(original);
    });
  });
});
