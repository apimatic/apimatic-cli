import { err, ok, Result } from 'neverthrow';
import { ApimaticConfigContext, ApimaticConfigWriteFailure } from './apimatic-config-context.js';
import { ApimaticConfigDocument, ConfigBlockName, findingClause } from './apimatic-config/document.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import {
  DEFAULT_PLUGIN_LICENSE,
  PluginAuthor,
  PluginConfigData,
  PluginIdentityData,
  PluginLanguageEntry,
  PluginLanguages,
  PluginMetadata
} from './plugin/plugin-config.js';
import { SemVersion } from './publish/version.js';
import { CodeGenerationVersion, isPluginLanguage, Language } from './sdk/generate.js';

export type PluginReleaseData = { pluginId: string; version: SemVersion };

/**
 * What a caller needs to know before generating. Metadata and languages are written by different
 * commands — `plugin generate` owns the first, `sdk publish` the second — so they are reported
 * separately. `path` rides on `unreadable` purely so the prompt can say where to fix the file.
 */
export type PluginConfigState =
  | { state: 'missing' }
  | { state: 'unreadable'; reason: string; path: FilePath }
  | PluginConfig;

/**
 * The `plugin` and `languages` blocks of `src/apimatic.json`, read. It is the third state a
 * config can be in, which is why it carries `state` — `present` means the document parsed with
 * nothing wrong in these two blocks, never that either block is there: a file holding only
 * languages is a present config with no identity, and `hasMetadata()` is what answers that.
 */
export class PluginConfig {
  public readonly state = 'present' as const;

  private constructor(private readonly config: PluginConfigData) {}

  public static create(config: PluginConfigData): PluginConfig {
    return new PluginConfig(config);
  }

  public hasPublishedSdks(): boolean {
    return this.publishedLanguages().length > 0;
  }

  /**
   * The languages whose SDK is published somewhere a reader can reach — a repository, a registry,
   * or both. These are the ones a plugin describes rather than carries, and the ones a language
   * selection may not drop: the entry records where the SDK actually went.
   */
  public publishedLanguages(): readonly Language[] {
    return this.languageEntries()
      .filter(([, entry]) => entry?.publishing?.source || entry?.publishing?.package)
      .map(([language]) => language);
  }

  /** Every language the config names, published or not. */
  public requestedLanguages(): readonly Language[] {
    return this.languageEntries().map(([language]) => language);
  }

  /**
   * Language keys a plugin cannot carry — java, php, ruby and go, which have no v4 renderer. They
   * are left in the file untouched; naming them is the only way a reader learns the plugin will
   * not include them.
   */
  public unsupportedLanguages(): readonly string[] {
    return Object.keys(this.config.languages).filter((language) => !isPluginLanguage(language));
  }

  /**
   * `configOf` is the only way into this class and it settles `languages` to an object — the
   * document hands back nothing else, and a file whose `languages` is not one is `unreadable`
   * before a config is built. So both readers below take the object as given.
   */
  private languageEntries(): [Language, PluginLanguages[Language]][] {
    return Object.entries(this.config.languages).filter(([language]) => isPluginLanguage(language)) as [
      Language,
      PluginLanguages[Language]
    ][];
  }

  public hasMetadata(): boolean {
    const isNonBlankString = (value: unknown) => typeof value === 'string' && value.trim() !== '';
    return isNonBlankString(this.config.pluginId) && isNonBlankString(this.config.pluginName);
  }

  /**
   * Absent until `plugin generate` records the identity. The fields are checked rather than trusted:
   * they reach this class through a cast of parsed JSON, so a hand-edited config can hold a number
   * where the type promises a string.
   */
  public getRelease(): PluginReleaseData | undefined {
    const pluginId = typeof this.config.pluginId === 'string' ? this.config.pluginId.trim() : '';
    const rawVersion = typeof this.config.pluginVersion === 'string' ? this.config.pluginVersion.trim() : '';
    if (pluginId === '' || rawVersion === '') {
      return undefined;
    }

    return SemVersion.tryCreate(rawVersion).match(
      (version) => ({ pluginId, version }),
      () => undefined
    );
  }

  public hasNoSourceRepository(language: Language): boolean {
    return !this.config.languages?.[language]?.publishing?.source;
  }

  public assertNoCodegenVersionMismatch(
    codegenVersion: CodeGenerationVersion,
    language: Language,
    entry: PluginLanguageEntry<Language>
  ): Result<void, { expected: CodeGenerationVersion; actual: CodeGenerationVersion }> {
    const publishing = entry.publishing;
    if (publishing?.package && publishing.source) {
      return ok(); // if both package and source are given, there is no possible mismatch
    }

    const existingPublishing = this.config.languages?.[language]?.publishing;
    if (!existingPublishing) {
      return ok();
    }

    if (!existingPublishing.package && !existingPublishing.source) {
      return ok();
    }

    const extractedVersion = existingPublishing.codegenVersion;
    if (!extractedVersion) {
      return ok();
    }

    if (extractedVersion === codegenVersion) {
      return ok();
    }

    return err({ expected: codegenVersion, actual: extractedVersion });
  }
}

export type PluginConfigWriteFailure = ApimaticConfigWriteFailure;

/**
 * The blocks the plugin commands read and write. A finding in one of them, or at the root, makes
 * the file unusable to them; one in `portal` is not theirs to see.
 */
const OWNED_BLOCKS: readonly ConfigBlockName[] = ['plugin', 'languages'];

/**
 * The `plugin` and `languages` blocks of `src/apimatic.json`, read together as the one
 * configuration the plugin commands know: the identity `plugin generate` records and the SDKs
 * `sdk publish` does.
 */
export class PluginConfigContext {
  private readonly configContext: ApimaticConfigContext;

  constructor(private readonly buildDirectory: DirectoryPath) {
    this.configContext = new ApimaticConfigContext(this.buildDirectory);
  }

  public async getPluginConfigState(): Promise<PluginConfigState> {
    const state = await this.configContext.read();
    if (state.state === 'missing') {
      return { state: 'missing' };
    }
    if (state.state === 'unparseable') {
      return { state: 'unreadable', reason: findingClause(state.findings), path: state.path };
    }

    const findings = state.document.findingsFor('root', ...OWNED_BLOCKS);
    if (findings.length > 0) {
      return { state: 'unreadable', reason: findingClause(findings), path: state.path };
    }
    return PluginConfig.create(PluginConfigContext.configOf(state.document));
  }

  /** Settles the byte-order mark before `plugin generate` zips `src/` and sends the file on. */
  public async removeByteOrderMark(): Promise<Result<void, PluginConfigWriteFailure>> {
    return await this.configContext.removeByteOrderMark();
  }

  public async upsertMetadata(
    metadata: PluginMetadata,
    author?: PluginAuthor
  ): Promise<Result<PluginConfig, PluginConfigWriteFailure>> {
    return await this.merge((document) => {
      const plugin = (document.plugin() ?? {}) as PluginIdentityData;
      return document.with('plugin', {
        ...plugin,
        pluginId: metadata.pluginId,
        pluginName: metadata.pluginName,
        pluginVersion: metadata.pluginVersion,
        ...(!plugin.author && author && { author }),
        license: plugin.license ?? DEFAULT_PLUGIN_LICENSE
      });
    });
  }

  /**
   * Records the languages the plugin should include. A language the config does not carry is added
   * as an empty entry — no `publishing` block at all, which is how "asked for, nothing published
   * yet" is written and what the service turns into an SDK bundled inside the plugin.
   *
   * An entry that is already there is left **byte-identical**, published or not: this writes what
   * is missing and never edits what is recorded, so a selection can neither blank a repository URL
   * nor restate one. A run that adds nothing does not rewrite the file.
   */
  public async requestLanguages(
    languages: readonly Language[]
  ): Promise<Result<PluginConfig, PluginConfigWriteFailure>> {
    const state = await this.getPluginConfigState();
    if (state.state === 'present' && languages.every((language) => state.requestedLanguages().includes(language))) {
      return ok(state);
    }

    return await this.merge((document) => {
      const recorded: PluginLanguages = { ...(document.languages() as PluginLanguages | undefined) };
      for (const language of languages) {
        recorded[language] ??= {};
      }
      return document.with('languages', recorded);
    });
  }

  public async upsertLanguage<L extends Language>(
    language: L,
    entry: PluginLanguageEntry<L>
  ): Promise<Result<PluginConfig, PluginConfigWriteFailure>> {
    return await this.merge((document) => {
      const languages: PluginLanguages = { ...(document.languages() as PluginLanguages | undefined) };
      const existingEntry = languages[language];
      // Preservation is one level down: a run that publishes only source must not drop the
      // package block a previous run recorded, and neither may blank a key this CLI version
      // does not model. A run carrying no publishing record at all leaves the existing one be.
      const existingPublishing = existingEntry?.publishing;
      const publishing = entry.publishing
        ? {
            ...existingPublishing,
            ...entry.publishing,
            source: entry.publishing.source ?? existingPublishing?.source,
            package: entry.publishing.package ?? existingPublishing?.package
          }
        : existingPublishing;
      languages[language] = { ...existingEntry, ...entry, ...(publishing ? { publishing } : {}) };
      return document.with('languages', languages);
    });
  }

  /**
   * The failure rules are the document context's: a file that cannot be parsed, or whose plugin
   * blocks are malformed, is left alone rather than overwritten, and a write fault is reported
   * rather than thrown. A success carries the config as it now stands, so a caller that has to
   * decide something after writing does not have to read the file back.
   */
  private async merge(
    apply: (document: ApimaticConfigDocument) => ApimaticConfigDocument
  ): Promise<Result<PluginConfig, PluginConfigWriteFailure>> {
    const merged = await this.configContext.merge(OWNED_BLOCKS, apply);
    return merged.map((document) => PluginConfig.create(PluginConfigContext.configOf(document)));
  }

  private static configOf(document: ApimaticConfigDocument): PluginConfigData {
    return {
      ...(document.plugin() as PluginIdentityData | undefined),
      languages: (document.languages() ?? {}) as PluginLanguages
    };
  }
}
