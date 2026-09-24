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
import { CodeGenerationVersion, isPluginLanguage, Language, PLUGIN_LANGUAGES } from './sdk/generate.js';

export type PluginReleaseData = { pluginId: string; version: SemVersion };

/** Published means a reader can reach the SDK: a repository, a registry, or both. */
const isPublished = (entry: PluginLanguageEntry<Language> | undefined): boolean =>
  Boolean(entry?.publishing?.source ?? entry?.publishing?.package);

export type PluginConfigState =
  | { state: 'missing' }
  | { state: 'unreadable'; reason: string; path: FilePath }
  | PluginConfig;

export class PluginConfig {
  public readonly state = 'present' as const;

  private constructor(private readonly config: PluginConfigData) {}

  public static create(config: PluginConfigData): PluginConfig {
    return new PluginConfig(config);
  }

  public publishedLanguages(): readonly Language[] {
    return this.languageEntries()
      .filter(([, entry]) => isPublished(entry))
      .map(([language]) => language);
  }

  public requestedLanguages(): readonly Language[] {
    return this.languageEntries().map(([language]) => language);
  }

  /**
   * The languages a plugin prompt comes up with checked. A config that names languages has already
   * made the choice. One that names none has not chosen against any of them — a first run, or a
   * project that has only ever had a spec — and for it the plugin covering everything is both the
   * common answer and the one a single Enter gives.
   */
  public initialLanguages(): readonly Language[] {
    const requested = this.requestedLanguages();

    return requested.length > 0 ? requested : PLUGIN_LANGUAGES;
  }

  public unsupportedLanguages(): readonly string[] {
    return Object.keys(this.config.languages).filter((language) => !isPluginLanguage(language));
  }

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
      return ok();
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

const OWNED_BLOCKS: readonly ConfigBlockName[] = ['plugin', 'languages'];

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
   * Records the languages the plugin covers, as a set rather than an addition: one the selection
   * drops loses its entry, which is the only thing that makes clearing a checkbox mean anything —
   * the service reads this block out of the zipped file, not the answers that produced it.
   *
   * Two kinds of entry are never dropped. A published one records where its SDK actually went, so
   * removing it would delete that record; and a language a plugin cannot carry — java, php, ruby,
   * go — was never the selection's to decide. An entry that stays is left byte-identical: this
   * writes what is missing and edits nothing, so a selection can neither blank a repository URL
   * nor restate one. A run that changes nothing does not rewrite the file.
   */
  public async requestLanguages(
    languages: readonly Language[]
  ): Promise<Result<PluginConfig, PluginConfigWriteFailure>> {
    return await this.merge((document) => {
      const existing = document.languages() ?? {};
      const covered = new Set<string>(languages);
      const recorded: Record<string, unknown> = {};

      for (const [language, entry] of Object.entries(existing)) {
        const keep =
          covered.has(language) || !isPluginLanguage(language) || isPublished(entry as PluginLanguageEntry<Language>);
        if (keep) {
          recorded[language] = entry;
        }
      }
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
