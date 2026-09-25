import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PluginConfigContext, PluginConfigState } from '../../src/types/plugin-config-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { LanguagePublishingEntry, PluginLanguages } from '../../src/types/apimatic-config/languages-block';
import { PluginIdentityData } from '../../src/types/plugin/plugin-config';
import { CSharpPackageConfiguration } from '../../src/types/publish/package-settings-configuration';
import { Language } from '../../src/types/sdk/generate';

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
  let sourceDirectory: DirectoryPath;
  let context: PluginConfigContext;

  // The package's name lives in the configuration now; a release records the version alone.
  const CSHARP_CONFIGURATION = { packageId: 'Acme.Payments.Sdk' } as CSharpPackageConfiguration;

  const CSHARP_PUBLISHING = {
    source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
    package: { version: '1.2.3' },
    packageConfiguration: CSHARP_CONFIGURATION
  } satisfies LanguagePublishingEntry<Language.CSHARP>;

  const CSHARP_ENTRY = { publishing: CSHARP_PUBLISHING } satisfies NonNullable<PluginLanguages['csharp']>;

  const SOURCE_ONLY_ENTRY = {
    publishing: { source: CSHARP_PUBLISHING.source, packageConfiguration: CSHARP_CONFIGURATION }
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const PACKAGE_ONLY_ENTRY = {
    publishing: { package: CSHARP_PUBLISHING.package, packageConfiguration: CSHARP_CONFIGURATION }
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const UNPUBLISHED_ENTRY = {
    publishing: { packageConfiguration: CSHARP_CONFIGURATION }
  } satisfies NonNullable<PluginLanguages['csharp']>;

  const METADATA = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };

  const configPath = () => path.join(sourceDirectory.toString(), 'apimatic.json');
  const written = () => fs.readFileSync(configPath(), 'utf-8');
  const writtenDocument = (): WrittenDocument => JSON.parse(written());

  const withFile = (text: string) => fs.writeFileSync(configPath(), text);
  const withConfig = (document: object) => withFile(JSON.stringify(document));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-config-context-'));
    sourceDirectory = new DirectoryPath(path.join(root, 'src'));
    fs.mkdirSync(sourceDirectory.toString(), { recursive: true });
    context = new PluginConfigContext(sourceDirectory);
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

      expect(presentState(await context.getPluginConfigState()).publishedLanguages()).to.not.be.empty;
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

      expect(presentState(state).publishedLanguages()).to.be.empty;
    });

    it('reports neither metadata nor languages for a bare file', async () => {
      withConfig({ languages: {} });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.publishedLanguages()).to.be.empty;
    });

    it('reports neither metadata nor languages for a file holding only the portal block', async () => {
      withConfig({ portal: { title: 'Calc' } });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.publishedLanguages()).to.be.empty;
    });

    it('reports languages without metadata for a file written by sdk publish', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.false;
      expect(present.publishedLanguages()).to.not.be.empty;
    });

    it('reports metadata without languages for a file written by plugin generate', async () => {
      withConfig({ plugin: METADATA, languages: {} });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.true;
      expect(present.publishedLanguages()).to.be.empty;
    });

    it('reports both once the config is complete', async () => {
      withConfig({ plugin: METADATA, languages: { csharp: CSHARP_ENTRY } });

      const present = presentState(await context.getPluginConfigState());

      expect(present.hasMetadata()).to.be.true;
      expect(present.publishedLanguages()).to.not.be.empty;
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
      expect(state.publishedLanguages()).to.be.empty;
    });
  });

  describe('recordLanguages', () => {
    it('adds a language the config does not carry as an entry with no publishing record', async () => {
      withConfig({ languages: {} });

      expect((await context.recordLanguages([Language.CSHARP, Language.PYTHON])).isOk()).to.be.true;
      expect(writtenDocument().languages).to.deep.equal({ csharp: {}, python: {} });
    });

    it('creates the file when there is none', async () => {
      expect((await context.recordLanguages([Language.TYPESCRIPT])).isOk()).to.be.true;
      expect(writtenDocument()).to.deep.equal({ schemaVersion: 1, languages: { typescript: {} } });
    });

    // The published entry records where the SDK actually went. Asking for that language again is
    // not a reason to touch it.
    it('leaves a published entry exactly as it was', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      await context.recordLanguages([Language.CSHARP, Language.PYTHON]);

      expect(writtenDocument().languages).to.deep.equal({ csharp: CSHARP_ENTRY, python: {} });
    });

    it('does not rewrite the file when every language is already recorded', async () => {
      const original = '{\n\t"languages": {"csharp": {}}\n}\n';
      withFile(original);

      expect((await context.recordLanguages([Language.CSHARP])).isOk()).to.be.true;
      expect(written()).to.equal(original);
    });

    it('reports the languages the config now names', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      const state = (await context.recordLanguages([Language.PYTHON]))._unsafeUnwrap();

      expect(state.initialLanguages()).to.deep.equal([Language.CSHARP, Language.PYTHON]);
      expect(state.publishedLanguages()).to.deep.equal([Language.CSHARP]);
    });

    // The service reads the block out of the zipped file, so an entry left behind is a language
    // the plugin still covers. Clearing a checkbox has to reach the file to mean anything.
    it('drops an unpublished language the selection no longer names', async () => {
      withConfig({ languages: { csharp: UNPUBLISHED_ENTRY, python: {}, typescript: {} } });

      expect((await context.recordLanguages([Language.CSHARP])).isOk()).to.be.true;
      expect(writtenDocument().languages).to.deep.equal({ csharp: UNPUBLISHED_ENTRY });
    });

    // Its entry records where the SDK actually went; dropping it would delete that record.
    it('keeps a published language the selection drops', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY, python: {} } });

      expect((await context.recordLanguages([Language.PYTHON])).isOk()).to.be.true;
      expect(writtenDocument().languages).to.deep.equal({ csharp: CSHARP_ENTRY, python: {} });
    });

    // java, php, ruby and go were never the selection's to decide.
    it('leaves a language a plugin cannot carry alone', async () => {
      withConfig({ languages: { java: CSHARP_ENTRY, go: {}, python: {} } });

      expect((await context.recordLanguages([Language.CSHARP])).isOk()).to.be.true;
      expect(writtenDocument().languages).to.deep.equal({ java: CSHARP_ENTRY, go: {}, csharp: {} });
    });

    it('reports a dropped language as no longer named', async () => {
      withConfig({ languages: { csharp: {}, python: {} } });

      const state = (await context.recordLanguages([Language.PYTHON]))._unsafeUnwrap();

      expect(state.initialLanguages()).to.deep.equal([Language.PYTHON]);
    });
  });

  describe('language sets', () => {
    const present = async () => {
      const state = await context.getPluginConfigState();
      if (state.state !== 'present') {
        expect.fail(`expected a present config, got ${state.state}`);
      }
      return state;
    };

    it('counts a language as published when either half is recorded', async () => {
      withConfig({
        languages: { csharp: SOURCE_ONLY_ENTRY, typescript: PACKAGE_ONLY_ENTRY, python: UNPUBLISHED_ENTRY }
      });

      const state = await present();

      expect(state.publishedLanguages()).to.deep.equal([Language.CSHARP, Language.TYPESCRIPT]);
      expect(state.initialLanguages()).to.deep.equal([Language.CSHARP, Language.TYPESCRIPT, Language.PYTHON]);
    });

    // java, php, ruby and go have no v4 renderer, so a plugin cannot carry them whatever the file
    // says. They are named rather than silently counted in.
    it('separates the languages a plugin cannot carry from the ones it can', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY, java: CSHARP_ENTRY, go: {} } });

      const state = await present();

      expect(state.initialLanguages()).to.deep.equal([Language.CSHARP]);
      expect(state.publishedLanguages()).to.deep.equal([Language.CSHARP]);
      expect(state.unsupportedLanguages()).to.deep.equal(['java', 'go']);
    });

    it('names nothing unsupported when the config carries only plugin languages', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY } });

      expect((await present()).unsupportedLanguages()).to.deep.equal([]);
    });

    it('offers the languages the config names as the ones already chosen', async () => {
      withConfig({ languages: { csharp: CSHARP_ENTRY, python: UNPUBLISHED_ENTRY } });

      expect((await present()).initialLanguages()).to.deep.equal([Language.CSHARP, Language.PYTHON]);
    });

    // A project that has never named a language has not chosen against any of them, and the plugin
    // covering everything is the answer a single Enter should give.
    it('offers every language a plugin can carry when the config names none', async () => {
      withConfig({ languages: {} });

      expect((await present()).initialLanguages()).to.deep.equal([
        Language.CSHARP,
        Language.TYPESCRIPT,
        Language.PYTHON
      ]);
    });

    it('offers every language when the config names only ones a plugin cannot carry', async () => {
      withConfig({ languages: { java: CSHARP_ENTRY } });

      expect((await present()).initialLanguages()).to.deep.equal([
        Language.CSHARP,
        Language.TYPESCRIPT,
        Language.PYTHON
      ]);
    });
  });
});
