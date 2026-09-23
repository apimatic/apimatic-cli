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
import { CodeGenerationVersion, Language } from './sdk/generate.js';

export type PluginReleaseData = { pluginId: string; version: SemVersion };

/**
 * What a caller needs to know before generating. Metadata and languages are written by different
 * commands — `plugin generate` owns the first, `sdk publish` the second — so they are reported
 * separately. `path` rides on `unreadable` purely so the prompt can say where to fix the file.
 */
export type PluginConfigState =
  | { state: 'missing' }
  | { state: 'unreadable'; reason: string; path: FilePath }
  | PluginConfigPresent;

export class PluginConfigPresent {
  public readonly state = 'present' as const;

  private constructor(private readonly config: PluginConfigData) {}

  public static create(config: PluginConfigData): PluginConfigPresent {
    return new PluginConfigPresent(config);
  }

  public hasPublishedSdks(): boolean {
    const languages = this.config.languages;
    if (typeof languages !== 'object' || languages === null) {
      return false;
    }

    return Object.values(languages).some((entry) => entry?.publishing?.source || entry?.publishing?.package);
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
    return PluginConfigPresent.create(PluginConfigContext.configOf(state.document));
  }

  /** Settles the byte-order mark before `plugin generate` zips `src/` and sends the file on. */
  public async removeByteOrderMark(): Promise<Result<void, PluginConfigWriteFailure>> {
    return await this.configContext.removeByteOrderMark();
  }

  public async upsertMetadata(
    metadata: PluginMetadata,
    author?: PluginAuthor
  ): Promise<Result<PluginConfigPresent, PluginConfigWriteFailure>> {
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

  public async upsertLanguage<L extends Language>(
    language: L,
    entry: PluginLanguageEntry<L>
  ): Promise<Result<PluginConfigPresent, PluginConfigWriteFailure>> {
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
  ): Promise<Result<PluginConfigPresent, PluginConfigWriteFailure>> {
    const merged = await this.configContext.merge(OWNED_BLOCKS, apply);
    return merged.map((document) => PluginConfigPresent.create(PluginConfigContext.configOf(document)));
  }

  private static configOf(document: ApimaticConfigDocument): PluginConfigData {
    return {
      ...(document.plugin() as PluginIdentityData | undefined),
      languages: (document.languages() ?? {}) as PluginLanguages
    };
  }
}
