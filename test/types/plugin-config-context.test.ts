import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PluginConfigContext, PluginConfigState } from '../../src/types/plugin-config-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import {
  LanguagePublishingEntry,
  PluginIdentityData,
  PluginLanguageEntry,
  PluginLanguages
} from '../../src/types/plugin/plugin-config';
import { CodeGenerationVersion, Language } from '../../src/types/sdk/generate';

/** The file as written back, read whole: the plugin blocks and whatever sits around them. */
interface WrittenDocument {
  schemaVersion?: number;
  portal?: unknown;
  plugin?: PluginIdentityData;
  languages?: PluginLanguages;
  [key: string]: unknown;
}

describe('PluginConfigContext', () => {
  let root: string;
  let buildDirectory: DirectoryPath;
  let context: PluginConfigContext;

  const CSHARP_PUBLISHING = {
    source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
    package: { packageId: 'Acme.Payments.Sdk', version: '1.2.3' },
    codegenVersion: CodeGenerationVersion.V3
  } satisfies LanguagePublishingEntry<Language.CSHARP>;

  const CSHARP_ENTRY = { publishing: CSHARP_PUBLISHING } satisfies NonNullable<PluginLanguages['csharp']>;

  const SOURCE_ONLY_ENTRY = {
    publishing: { source: CSHARP_PUBLISHING.source, codegenVersion: CSHARP_PUBLISHING.codegenVersion }
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const PACKAGE_ONLY_ENTRY = {
    publishing: { package: CSHARP_PUBLISHING.package, codegenVersion: CSHARP_PUBLISHING.codegenVersion }
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const UNPUBLISHED_ENTRY = {
    publishing: { codegenVersion: CSHARP_PUBLISHING.codegenVersion }
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const METADATA = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };

  const configPath = () => path.join(buildDirectory.toString(), 'apimatic.json');
  const written = () => fs.readFileSync(configPath(), 'utf-8');
  const writtenDocument = (): WrittenDocument => JSON.parse(written());

  const withFile = (text: string) => fs.writeFileSync(configPath(), text);
  const withConfig = (document: object) => withFile(JSON.stringify(document));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-config-context-'));
    buildDirectory = new DirectoryPath(path.join(root, 'src'));
    fs.mkdirSync(buildDirectory.toString(), { recursive: true });
    context = new PluginConfigContext(buildDirectory);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('getPluginConfigState', () => {
    const presentState = (state: PluginConfigState) => {
      if (state.state !== 'present') {
        expect.fail(`expected a present config, got ${state.state}`);
      }
      return state;
    };

    it('is missing when there is no file', async () => {
      expect(await context.getPluginConfigState()).to.deep.equal({ state: 'missing' });
    });

    (
      [
        ['is unreadable when the file is not valid JSON', '{ not json', 'it is not valid JSON'],
        ['is unreadable when the file is a JSON array', '[]', 'it is not a JSON object'],
        ['says the file is empty rather than reporting a JSON syntax error', '', 'it is empty']
      ] as const
    ).forEach(([name, text, reason]) => {
      it(name, async () => {
        withFile(text);

        expect(await context.getPluginConfigState()).to.include({ state: 'unreadable', reason });
      });
    });

    it('reads past the byte-order mark an editor left at the front of the file', async () => {
      withFile('﻿{ "languages": {} }');

      expect((await context.getPluginConfigState()).state).to.equal('present');
    });

    it('names the languages block when it is not a JSON object', async () => {
      withConfig({ languages: 'csharp' });

      const state = await context.getPluginConfigState();

      expect(state).to.include({ state: 'unreadable', reason: `its 'languages' is not a JSON object` });
    });

    it('names the language whose entry is not a JSON object', async () => {
      withConfig({ languages: { csharp: 'v3' } });

      const state = await context.getPluginConfigState();

      expect(state).to.include({ state: 'unreadable', reason: `its 'languages.csharp' is not a JSON object` });
    });

    it('refuses a schema version this CLI does not read, naming it', async () => {
      withConfig({ schemaVersion: 2, languages: {} });

      const state = await context.getPluginConfigState();

      expect(state).to.include({ state: 'unreadable' });
      expect((state as { reason: string }).reason)
        .to.contain(`'schemaVersion'`)
        .and.to.contain('2');
    });

    // The portal block is the portal's to judge: a broken one must not stop a publish being recorded.
    it('reads a file whose portal block is malformed', async () => {
      withConfig({ portal: 'not a portal', languages: { csharp: CSHARP_ENTRY } });

      expect(presentState(await context.getPluginConfigState()).hasPublishedSdks()).to.be.true;
    });

    const reasonOf = async (document: object) => {
      withConfig(document);
      const state = await context.getPluginConfigState();
      expect(state).to.include({ state: 'unreadable' });
      return (state as { reason: string }).reason;
    };

    const releaseOf = async (document: object) => {
      withConfig(document);
      return presentState(await context.getPluginConfigState()).getRelease();
    };

    ['Acme Payments', 'acme_payments', 'Acme-Payments', 'acme--payments', '-acme', 'acme-'].forEach((pluginId) => {
      it(`names pluginId when it is '${pluginId}'`, async () => {
        expect(await reasonOf({ plugin: { ...METADATA, pluginId }, languages: {} })).to.contain(`'plugin.pluginId'`);
      });
    });

    ['1.2', '1.2.3.4', 'v1.2.3', '1.2.x', 'latest'].forEach((pluginVersion) => {
      it(`names pluginVersion when it is '${pluginVersion}'`, async () => {
        expect(await reasonOf({ plugin: { ...METADATA, pluginVersion }, languages: {} })).to.contain(
          `'plugin.pluginVersion'`
        );
      });
    });

    // A hand-edited field is worth reporting even when the other one has yet to be written.
    it('names a malformed pluginId whose version is not set yet', async () => {
      expect(await reasonOf({ plugin: { pluginId: 'Acme Payments' }, languages: {} })).to.contain(`'plugin.pluginId'`);
    });

    it('names a malformed pluginVersion whose id is not set yet', async () => {
      expect(await reasonOf({ plugin: { pluginVersion: '1.2' }, languages: {} })).to.contain(`'plugin.pluginVersion'`);
    });

    it('reports the release once the identity is recorded', async () => {
      const release = await releaseOf({ plugin: METADATA, languages: {} });

      expect(release?.pluginId).to.equal('acme-payments');
      expect(`${release?.version}`).to.equal('0.1.0');
    });

    it('refuses an identity padded with whitespace', async () => {
      expect(
        await reasonOf({ plugin: { pluginId: '  acme-payments  ', pluginVersion: '0.1.0' }, languages: {} })
      ).to.contain(`'plugin.pluginId'`);
      expect(
        await reasonOf({ plugin: { pluginId: 'acme-payments', pluginVersion: '  0.1.0  ' }, languages: {} })
      ).to.contain(`'plugin.pluginVersion'`);
    });

    (
      [
        ['no id', { plugin: { pluginVersion: '1.0.0' }, languages: {} }],
        ['no version', { plugin: { pluginId: 'acme-payments' }, languages: {} }],
        ['no plugin block at all, as sdk publish writes it', { languages: { csharp: CSHARP_ENTRY } }]
      ] as const
    ).forEach(([label, document]) => {
      it(`reports no release for ${label}`, async () => {
        expect(await releaseOf(document)).to.be.undefined;
      });
    });

    // A field written as blank can only be hand-edited, so it is refused rather than read as absent.
    it('refuses a blank id', async () => {
      expect(await reasonOf({ plugin: { pluginId: '   ', pluginVersion: '1.0.0' }, languages: {} })).to.contain(
        `'plugin.pluginId'`
      );
    });

    it('refuses a blank version', async () => {
      expect(await reasonOf({ plugin: { pluginId: 'acme-payments', pluginVersion: '  ' }, languages: {} })).to.contain(
        `'plugin.pluginVersion'`
      );
    });

    it('reports no release for an id that is not a string', async () => {
      expect(await releaseOf({ plugin: { pluginId: 7, pluginVersion: '1.0.0' }, languages: {} })).to.be.undefined;
    });

    it('accepts a config carrying no languages block at all', async () => {
      withConfig({ plugin: METADATA });

      const state = await context.getPluginConfigState();

      expect(presentState(state).hasPublishedSdks()).to.be.false;
    });

    it('reports neither metadata nor languages for a bare file', async () => {
      withConfig({ languages: {} });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.hasPublishedSdks()).to.be.false;
    });

    it('reports neither metadata nor languages for a file holding only the portal block', async () => {
      withConfig({ portal: { title: 'Calc' } });

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
      withConfig({ plugin: METADATA, languages: {} });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.true;
      expect(present.hasPublishedSdks()).to.be.false;
    });

    it('reports both once the config is complete', async () => {
      withConfig({ plugin: METADATA, languages: { csharp: CSHARP_ENTRY } });

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
          typescript: {
            publishing: { package: { name: '@acme/sdk', version: '1.2.3' }, codegenVersion: CodeGenerationVersion.V3 }
          }
        }
      });

      expect(presentState(await context.getPluginConfigState()).hasPublishedSdks()).to.be.true;
    });

    it('refuses a blank plugin id before metadata is considered', async () => {
      withConfig({ plugin: { pluginId: '   ', pluginName: 'Acme' }, languages: {} });

      expect(await context.getPluginConfigState()).to.include({ state: 'unreadable' });
    });

    it('does not count a plugin id that is not a string as metadata', async () => {
      withConfig({ plugin: { pluginId: 7, pluginName: 'Acme' }, languages: {} });

      expect(presentState(await context.getPluginConfigState()).hasMetadata()).to.be.false;
    });

    it('reports a recorded source repository for the language', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasNoSourceRepository(Language.CSHARP)).to.be.false;
      expect(present.hasNoSourceRepository(Language.JAVA)).to.be.true;
    });

    it('reports no source repository for an entry carrying only a package', async () => {
      withConfig({
        languages: { csharp: { publishing: { package: CSHARP_PUBLISHING.package, codegenVersion: 'v3' } } }
      });

      expect(presentState(await context.getPluginConfigState()).hasNoSourceRepository(Language.CSHARP)).to.be.true;
    });
  });

  describe('assertNoCodegenVersionMismatch', () => {
    const PUBLISHED_SOURCE = {
      publishing: { source: CSHARP_PUBLISHING.source, codegenVersion: CodeGenerationVersion.V3 }
    } satisfies PluginLanguageEntry<Language.CSHARP>;

    const PUBLISHED_PACKAGE = {
      publishing: { package: CSHARP_PUBLISHING.package, codegenVersion: CodeGenerationVersion.V3 }
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
      const recorded = { publishing: { source: CSHARP_PUBLISHING.source, codegenVersion: CodeGenerationVersion.V3 } };

      const result = await assertFor({ csharp: recorded }, PUBLISHED_PACKAGE, CodeGenerationVersion.V4);

      expect(result.isErr()).to.be.true;
      expect(result._unsafeUnwrapErr()).to.deep.equal({
        expected: CodeGenerationVersion.V4,
        actual: CodeGenerationVersion.V3
      });
    });

    it('reports the mismatch when a source-only run leaves a package behind', async () => {
      const recorded = { publishing: { package: CSHARP_PUBLISHING.package, codegenVersion: CodeGenerationVersion.V3 } };

      const result = await assertFor({ csharp: recorded }, PUBLISHED_SOURCE, CodeGenerationVersion.V4);

      expect(result.isErr()).to.be.true;
    });

    it('passes when the recorded version is the one being published', async () => {
      const recorded = { publishing: { source: CSHARP_PUBLISHING.source, codegenVersion: CodeGenerationVersion.V3 } };

      expect((await assertFor({ csharp: recorded }, PUBLISHED_PACKAGE)).isOk()).to.be.true;
    });

    it('passes for a language the config does not carry', async () => {
      const result = await assertFor({ java: CSHARP_ENTRY }, PUBLISHED_PACKAGE, CodeGenerationVersion.V4);

      expect(result.isOk()).to.be.true;
    });

    it('passes when the recorded entry has no half to carry over', async () => {
      const recorded = { publishing: { codegenVersion: CodeGenerationVersion.V3 } };

      expect((await assertFor({ csharp: recorded }, PUBLISHED_PACKAGE, CodeGenerationVersion.V4)).isOk()).to.be.true;
    });

    it('passes when the recorded entry records no version', async () => {
      const recorded = { publishing: { source: { repositoryUrl: 'https://github.com/acme/sdk' } } };

      expect((await assertFor({ csharp: recorded }, PUBLISHED_PACKAGE, CodeGenerationVersion.V4)).isOk()).to.be.true;
    });
  });

  describe('upsertMetadata', () => {
    it('creates the file with the plugin block, the metadata and a default licence', async () => {
      expect((await context.upsertMetadata(METADATA)).isOk()).to.be.true;
      expect(writtenDocument()).to.deep.equal({
        schemaVersion: 1,
        plugin: { ...METADATA, license: 'MIT' }
      });
    });

    it('records the author when one is supplied', async () => {
      await context.upsertMetadata(METADATA, { name: 'Acme', email: 'developers@acme.com' });

      expect(writtenDocument().plugin?.author).to.deep.equal({ name: 'Acme', email: 'developers@acme.com' });
    });

    it('leaves an author the config already credits alone', async () => {
      withConfig({ plugin: { author: { name: 'Acme Engineering' } }, languages: {} });

      await context.upsertMetadata(METADATA, { name: 'Someone Else', email: 'someone@else.com' });

      expect(writtenDocument().plugin?.author).to.deep.equal({ name: 'Acme Engineering' });
    });

    it('never writes a plugin key', async () => {
      await context.upsertMetadata(METADATA);

      expect(writtenDocument().plugin).to.not.have.property('pluginKey');
    });

    it('leaves a hand-written licence alone', async () => {
      withConfig({ plugin: { license: 'Apache-2.0' }, languages: {} });

      await context.upsertMetadata(METADATA);

      expect(writtenDocument().plugin?.license).to.equal('Apache-2.0');
    });

    it('adds the plugin block to a config sdk publish already created, keeping its languages', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      await context.upsertMetadata(METADATA);

      const document = writtenDocument();
      expect(document.plugin).to.include(METADATA);
      expect(document.languages).to.deep.equal({ csharp: CSHARP_ENTRY });
      expect(Object.keys(document)).to.deep.equal(['languages', 'plugin']);
    });

    it('writes the plugin block into a file holding only the portal, leaving the portal first and untouched', async () => {
      withConfig({ portal: { title: 'Calc', logo: 'static/logo.png' } });

      await context.upsertMetadata(METADATA);

      const document = writtenDocument();
      expect(Object.keys(document)).to.deep.equal(['portal', 'plugin']);
      expect(document.portal).to.deep.equal({ title: 'Calc', logo: 'static/logo.png' });
    });

    it('preserves plugin fields this CLI version does not model', async () => {
      withConfig({ plugin: { pluginKey: 'hand-written', homepage: 'https://acme.com' }, languages: {} });

      await context.upsertMetadata(METADATA);

      const plugin = writtenDocument().plugin;
      expect(plugin?.pluginKey).to.equal('hand-written');
      expect(plugin?.homepage).to.equal('https://acme.com');
    });

    it('preserves root keys this CLI version does not model', async () => {
      withConfig({ future: { enabled: true }, languages: {} });

      await context.upsertMetadata(METADATA);

      expect(writtenDocument().future).to.deep.equal({ enabled: true });
    });

    it('does not add a schema version to a file that has none', async () => {
      withConfig({ languages: {} });

      await context.upsertMetadata(METADATA);

      expect(writtenDocument()).to.not.have.property('schemaVersion');
    });

    it('keeps the indentation the file already uses', async () => {
      withFile('{\n    "languages": {}\n}\n');

      await context.upsertMetadata(METADATA);

      expect(written()).to.contain('\n    "plugin": {\n        "pluginId": "acme-payments",');
      expect(written().endsWith('\n')).to.be.true;
    });

    it('refuses to overwrite a file it could not read', async () => {
      withFile('{ not json');

      expect((await context.upsertMetadata(METADATA))._unsafeUnwrapErr()).to.equal('unreadable');
      expect(written()).to.equal('{ not json');
    });
  });

  describe('the state a write hands back', () => {
    it('reports the metadata it just wrote', async () => {
      const state = (await context.upsertMetadata(METADATA))._unsafeUnwrap();

      expect(state.hasMetadata()).to.be.true;
      expect(state.hasPublishedSdks()).to.be.false;
    });

    it('reports the language it just wrote, alongside metadata written earlier', async () => {
      withConfig({ plugin: METADATA, languages: {} });

      const state = (await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY))._unsafeUnwrap();

      expect(state.hasPublishedSdks()).to.be.true;
      expect(state.hasMetadata()).to.be.true;
      expect(state.hasNoSourceRepository(Language.CSHARP)).to.be.false;
    });
  });

  describe('upsertLanguage', () => {
    it('creates the file with the languages block and no plugin block at all', async () => {
      expect((await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY)).isOk()).to.be.true;
      expect(writtenDocument()).to.deep.equal({
        schemaVersion: 1,
        languages: { csharp: CSHARP_ENTRY }
      });
    });

    it('adds a second language beside the first', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      const typescriptEntry = {
        publishing: {
          source: { repositoryUrl: 'https://github.com/acme/acme-payments-typescript' },
          package: { name: '@acme/payments-sdk', version: '1.2.3' },
          codegenVersion: CodeGenerationVersion.V3
        }
      } satisfies NonNullable<PluginLanguages['typescript']>;
      await context.upsertLanguage(Language.TYPESCRIPT, typescriptEntry);

      expect(writtenDocument().languages).to.deep.equal({ csharp: CSHARP_ENTRY, typescript: typescriptEntry });
    });

    it('replaces both halves when the run published both', async () => {
      withConfig({ languages: { csharp: { publishing: { source: { repositoryUrl: 'https://old' } } } } });

      await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY);

      expect(writtenDocument().languages).to.deep.equal({ csharp: CSHARP_ENTRY });
    });

    describe('keeps the half the run did not publish', () => {
      it('carries the recorded package over a source-only publish', async () => {
        withConfig({ languages: { csharp: CSHARP_ENTRY } });

        await context.upsertLanguage(Language.CSHARP, {
          publishing: {
            source: { repositoryUrl: 'https://github.com/acme/renamed' },
            codegenVersion: CodeGenerationVersion.V3
          }
        });

        expect(writtenDocument().languages?.csharp).to.deep.equal({
          publishing: {
            source: { repositoryUrl: 'https://github.com/acme/renamed' },
            package: CSHARP_PUBLISHING.package,
            codegenVersion: 'v3'
          }
        });
      });

      it('carries the recorded source over a package-only publish', async () => {
        withConfig({ languages: { csharp: CSHARP_ENTRY } });

        await context.upsertLanguage(Language.CSHARP, {
          publishing: {
            package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
            codegenVersion: CodeGenerationVersion.V3
          }
        });

        expect(writtenDocument().languages?.csharp).to.deep.equal({
          publishing: {
            source: CSHARP_PUBLISHING.source,
            package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
            codegenVersion: 'v3'
          }
        });
      });

      it('records the entry as it stands when the language is new to the config', async () => {
        withConfig({ languages: {} });

        await context.upsertLanguage(Language.CSHARP, {
          publishing: {
            package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
            codegenVersion: CodeGenerationVersion.V3
          }
        });

        expect(writtenDocument().languages?.csharp).to.deep.equal({
          publishing: {
            package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
            codegenVersion: 'v3'
          }
        });
      });

      it('still takes the codegen version from the run that just published', async () => {
        withConfig({ languages: { csharp: CSHARP_ENTRY } });

        await context.upsertLanguage(Language.CSHARP, {
          publishing: {
            package: { packageId: 'Acme.Payments.Sdk', version: '2.0.0' },
            codegenVersion: CodeGenerationVersion.V4
          }
        });

        expect(writtenDocument().languages?.csharp?.publishing?.codegenVersion).to.equal('v4');
      });
    });

    it('leaves the existing plugin block untouched', async () => {
      withConfig({ plugin: { ...METADATA, license: 'MIT' }, languages: {} });

      await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY);

      expect(writtenDocument().plugin).to.deep.equal({ ...METADATA, license: 'MIT' });
    });

    // A publish that succeeded is recorded whatever state the portal is in.
    it('records past a portal block it cannot read, leaving it as written', async () => {
      withConfig({ portal: 'not a portal', languages: {} });

      expect((await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY)).isOk()).to.be.true;
      expect(writtenDocument().portal).to.equal('not a portal');
      expect(writtenDocument().languages).to.deep.equal({ csharp: CSHARP_ENTRY });
    });

    it('refuses a languages block it cannot merge rather than spreading it into the file', async () => {
      const original = JSON.stringify({ languages: 'csharp' });
      withFile(original);

      expect((await context.upsertLanguage(Language.CSHARP, CSHARP_ENTRY))._unsafeUnwrapErr()).to.equal('unreadable');
      expect(written()).to.equal(original);
    });
  });
});
