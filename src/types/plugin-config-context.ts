import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { CodeGenerationVersion, Language } from './sdk/generate.js';
import {
  DEFAULT_PLUGIN_LICENSE,
  PluginAuthor,
  PluginConfigData,
  PluginLanguageEntry,
  PluginLanguages,
  PluginMetadata
} from './plugin/plugin-config.js';
import { SemVersion } from './publish/version.js';
import { err, ok, Result } from 'neverthrow';

/** Also the rule the metadata prompt validates against, so a plugin ID is legal as a repository name. */
export const PLUGIN_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const MALFORMED_PLUGIN_ID =
  `its 'pluginId' must be lower-case alphanumeric words separated by single dashes, ` +
  `for example 'acme-payments'`;

const MALFORMED_PLUGIN_VERSION =
  `its 'pluginVersion' must be a version in the format major.minor.patch, for example '0.1.0'`;

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

    return Object.values(languages).some((entry) => entry?.source || entry?.package);
  }

  public hasMetadata(): boolean {
    const isNonBlankString = (value: unknown) => typeof value === 'string' && value.trim() !== '';
    return isNonBlankString(this.config.pluginId) && isNonBlankString(this.config.pluginName);
  }

  /** Absent until `plugin generate` records the identity; never malformed, `parse` refuses that. */
  public getRelease(): PluginReleaseData | undefined {
    const pluginId = this.config.pluginId;
    const version = this.config.pluginVersion
    ? SemVersion.tryCreate(this.config.pluginVersion).unwrapOr(undefined)
    : undefined;
    return pluginId && version ? { pluginId , version } : undefined;
  }

  public hasNoSourceRepository(language: Language): boolean {
    return !this.config.languages?.[language]?.source;
  }

  public assertNoCodegenVersionMismatch(
    codegenVersion: CodeGenerationVersion,
    language: Language,
    entry: PluginLanguageEntry<Language>
  ): Result<void, { expected: CodeGenerationVersion; actual: CodeGenerationVersion }> {
    if (entry.package && entry.source) {
      return ok();  // if both package and source are given, there is no possible mismatch
    }

    const existingEntry = this.config.languages?.[language];
    if (!existingEntry) {
      return ok();
    }

    if (!existingEntry.package && !existingEntry.source) {
      return ok();
    }

    const extractedVersion = this.config.languages?.[language]?.codegenVersion;
    if (!extractedVersion) {
      return ok();
    }

    if (extractedVersion === codegenVersion) {
      return ok();
    }

    return err({ expected: codegenVersion, actual: extractedVersion });
  }
}

export type PluginConfigWriteFailure = 'unreadable' | 'unwritable';

type ParseResult = { config: PluginConfigData } | { reason: string };

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class PluginConfigContext {
  private readonly fileService = new FileService();

  constructor(private readonly buildDirectory: DirectoryPath) {}

  private get configPath(): FilePath {
    return new FilePath(this.buildDirectory, new FileName('plugin-config.json'));
  }

  public async getPluginConfigState(): Promise<PluginConfigState> {
    if (!(await this.fileService.fileExists(this.configPath))) {
      return { state: 'missing' };
    }

    const parsed = await this.parse();
    if ('reason' in parsed) {
      return { state: 'unreadable', reason: parsed.reason, path: this.configPath };
    }

    return PluginConfigPresent.create(parsed.config);
  }

  public async upsertMetadata(
    metadata: PluginMetadata,
    author?: PluginAuthor
  ): Promise<Result<PluginConfigPresent, PluginConfigWriteFailure>> {
    return await this.merge((config) => ({
      ...config,
      pluginId: metadata.pluginId,
      pluginName: metadata.pluginName,
      pluginVersion: metadata.pluginVersion,
      ...(!config.author && author && { author }),
      license: config.license ?? DEFAULT_PLUGIN_LICENSE
    }));
  }

  public async upsertLanguage<L extends Language>(
    language: L,
    entry: PluginLanguageEntry<L>
  ): Promise<Result<PluginConfigPresent, PluginConfigWriteFailure>> {
    return await this.merge((config) => {
      const languages: PluginLanguages = { ...config.languages };
      const existingEntry = config.languages?.[language];
      languages[language] = {
        ...existingEntry,
        ...entry,
        source: entry.source ?? existingEntry?.source,
        package: entry.package ?? existingEntry?.package
      };
      return { ...config, languages };
    });
  }

  /**
   * A file that exists but cannot be parsed is left alone rather than overwritten, and a write
   * fault is reported rather than thrown: this runs after a publish that already succeeded, and
   * nothing here may turn that into a crash. A success carries the config as it now stands, so a
   * caller that has to decide something after writing does not have to read the file back.
   */
  private async merge(
    apply: (config: PluginConfigData) => PluginConfigData
  ): Promise<Result<PluginConfigPresent, PluginConfigWriteFailure>> {
    const existing = await this.read();
    if ('reason' in existing) {
      return err('unreadable');
    }

    const merged = apply(existing.config);

    try {
      await this.write(merged);
    } catch {
      return err('unwritable');
    }

    return ok(PluginConfigPresent.create(merged));
  }

  private async read(): Promise<ParseResult> {
    if (!(await this.fileService.fileExists(this.configPath))) {
      return { config: { languages: {} } };
    }
    return await this.parse();
  }

  private async parse(): Promise<ParseResult> {
    const BYTE_ORDER_MARK = 0xfeff; // Notepad and PowerShell redirection can write it
    try {
      // TODO: JSON Parsing/Stringify should be in a dedicated JSON infra layer which preferably uses zod
      const contents = await this.fileService.getContents(this.configPath);
      if (contents.trim() === '') {
        return { reason: 'it is empty' };
      }
      if (contents.codePointAt(0) === BYTE_ORDER_MARK) {
        return { reason: 'it starts with a byte-order mark, which JSON does not allow' };
      }

      const parsed: unknown = JSON.parse(contents);
      if (!isJsonObject(parsed)) {
        return { reason: 'it is not a JSON object' };
      }
      // Every write merges these by spreading them, which turns a string into `{"0":"a"}` and a
      // number into nothing, so a wrong shape has to be refused before it can corrupt the file.
      const languages = parsed.languages;
      if (languages !== undefined) {
        if (!isJsonObject(languages)) {
          return { reason: `its 'languages' field is not a JSON object` };
        }
        for (const [language, entry] of Object.entries(languages)) {
          if (!isJsonObject(entry)) {
            return { reason: `its 'languages.${language}' entry is not a JSON object` };
          }
        }
      }

      const id = parsed.pluginId;
      if (typeof id === 'string' && (id.trim() === '' || !PLUGIN_ID_PATTERN.test(id))) {
        return { reason: MALFORMED_PLUGIN_ID };
      }

      const rawVersion = parsed.pluginVersion;
      if (typeof rawVersion === 'string' && (rawVersion.trim() === '' || SemVersion.tryCreate(rawVersion).isErr())) {
        return { reason: MALFORMED_PLUGIN_VERSION };
      }

      return { config: parsed as PluginConfigData };
    } catch (error) {
      return { reason: error instanceof Error ? error.message : String(error) };
    }
  }

  private async write(config: PluginConfigData): Promise<void> {
    await this.fileService.ensurePathExists(this.configPath);
    await this.fileService.writeContents(this.configPath, JSON.stringify(config, null, 2));
  }
}
