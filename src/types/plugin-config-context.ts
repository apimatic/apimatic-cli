import { Result, ResultAsync } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
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
import { AVAILABLE_LANGUAGES, isAvailableLanguage, Language } from './sdk/generate.js';

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

  private constructor(
    private readonly config: PluginConfigData,
    private readonly entries: readonly [Language, PluginLanguages[Language]][],
    private readonly unsupported: readonly string[]
  ) {}

  /** The one place `languages` is sorted into what a plugin can carry and what it cannot. */
  public static create(config: PluginConfigData): PluginConfig {
    const entries: [Language, PluginLanguages[Language]][] = [];
    const unsupported: string[] = [];

    for (const [language, entry] of Object.entries(config.languages)) {
      if (isAvailableLanguage(language)) {
        entries.push([language, entry as PluginLanguages[Language]]);
      } else {
        unsupported.push(language);
      }
    }

    return new PluginConfig(config, entries, unsupported);
  }

  public publishedLanguages(): readonly Language[] {
    return this.entries.filter(([, entry]) => isPublished(entry)).map(([language]) => language);
  }

  // A config naming none has not chosen against any: covering everything is what one Enter gives.
  public initialLanguages(): readonly Language[] {
    const requested = this.entries.map(([language]) => language);

    return requested.length > 0 ? requested : AVAILABLE_LANGUAGES;
  }

  public unsupportedLanguages(): readonly string[] {
    return this.unsupported;
  }

  // Checked, not trusted: the config arrives through a cast of parsed JSON, so a hand-edited
  // file can hold a number where the type promises a string.
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
}

export type PluginConfigWriteFailure = ApimaticConfigWriteFailure;

const OWNED_BLOCKS: readonly ConfigBlockName[] = ['plugin', 'languages'];

/**
 * A `languages` block holding what the selection covers plus every entry `keep` speaks for.
 * Existing keys stay in place, so a merge that changes nothing writes nothing.
 */
const recorded = (
  document: ApimaticConfigDocument,
  languages: readonly Language[],
  keep: (language: string, entry: PluginLanguageEntry<Language> | undefined) => boolean
): Record<string, unknown> => {
  const existing = document.languages() ?? {};
  const covered = new Set<string>(languages);
  const kept = Object.entries(existing).filter(
    ([language, entry]) => covered.has(language) || keep(language, entry as PluginLanguageEntry<Language>)
  );
  const added = languages.filter((language) => !(language in existing)).map((language) => [language, {}]);

  return Object.fromEntries([...kept, ...added]);
};

/** In the user's file a cleared language goes, unless its entry records where an SDK was published. */
const keepsRecord = (language: string, entry: PluginLanguageEntry<Language> | undefined): boolean =>
  !isAvailableLanguage(language) || isPublished(entry);

const isUnavailableLanguage = (language: string): boolean => !isAvailableLanguage(language);

export class PluginConfigContext {
  private readonly configContext: ApimaticConfigContext;
  private readonly fileService = new FileService();

  constructor(private readonly sourceDirectory: DirectoryPath) {
    this.configContext = new ApimaticConfigContext(this.sourceDirectory);
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

  // A published entry survives a cleared checkbox: only `sdk publish` can write that record.
  public async recordLanguages(
    languages: readonly Language[]
  ): Promise<Result<PluginConfig, PluginConfigWriteFailure>> {
    return await this.merge((document) => document.with('languages', recorded(document, languages, keepsRecord)));
  }

  /**
   * The `src/` to upload: a copy whose `languages` names exactly what the plugin covers. The
   * user's file keeps the published entries this run leaves out; the service reads the copy.
   */
  public async stageUpload(
    into: DirectoryPath,
    languages: readonly Language[]
  ): Promise<Result<DirectoryPath, PluginConfigWriteFailure>> {
    const staged = into.join('build');
    await this.fileService.copyDirectoryContents(this.sourceDirectory, staged);

    const config = new ApimaticConfigContext(staged);
    const covered = await config.merge(OWNED_BLOCKS, (document) =>
      document.with('languages', recorded(document, languages, isUnavailableLanguage))
    );

    // The merge writes nothing when it changes nothing, so a mark on the copy can outlive it —
    // and the service reads this file with a parser that will not look past one.
    return await covered.asyncAndThen(() => new ResultAsync(config.removeByteOrderMark())).map(() => staged);
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
