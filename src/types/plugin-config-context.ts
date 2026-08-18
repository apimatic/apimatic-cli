import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import {
  DEFAULT_PLUGIN_LICENSE,
  LanguageEntry,
  PLUGIN_CONFIG_SCHEMA_VERSION,
  PluginAuthor,
  PluginConfigData,
  PluginMetadata
} from './plugin/plugin-config.js';
import { Language } from './sdk/generate.js';

/**
 * What a caller needs to know before generating. Metadata and languages are written by different
 * commands — `plugin generate` owns the first, `sdk publish` the second — so they are reported
 * separately. `path` rides on `unreadable` purely so the prompt can say where to fix the file.
 */
export type PluginConfigState =
  | { state: 'missing' }
  | { state: 'unreadable'; reason: string; path: FilePath }
  | PluginConfigPresent;

class PluginConfigPresent {
  public readonly state = 'present' as const;

  private constructor(private readonly config: PluginConfigData) {}

  public static create(config: PluginConfigData): PluginConfigPresent {
    return new PluginConfigPresent(config)
  }

  public hasPublishedSdks(): boolean {
    const languages = this.config.languages;
    return typeof languages === 'object' && languages !== null && Object.keys(languages).length > 0;
  }

  public hasMetadata(): boolean {
    return Boolean(this.config.pluginId?.trim()) && Boolean(this.config.pluginName?.trim());
  }
}

/**
 * Why a write did or did not happen. A bare boolean cannot say whether the file was unusable or
 * the disk refused it, and callers have to tell the user which.
 */
export type PluginConfigWriteResult = 'written' | 'unreadable' | 'unwritable';

type ParseResult = { config: PluginConfigData } | { reason: string };

export class PluginConfigContext {
  private readonly fileService = new FileService();

  constructor(private readonly buildDirectory: DirectoryPath) {}

  private get configPath(): FilePath {
    return new FilePath(this.buildDirectory, new FileName('plugin-config.json'));
  }

  public async loadState(): Promise<PluginConfigState> {
    if (!(await this.fileService.fileExists(this.configPath))) {
      return { state: 'missing' };
    }

    const parsed = await this.parse();
    if ('reason' in parsed) {
      return { state: 'unreadable', reason: parsed.reason, path: this.configPath };
    }

    // A version this CLI does not model would be uploaded and rejected server-side, so it is
    // refused here instead. Absent is fine — the next write backfills it.
    const { schemaVersion } = parsed.config;
    if (schemaVersion !== undefined && schemaVersion !== PLUGIN_CONFIG_SCHEMA_VERSION) {
      const reason =
        `it declares schemaVersion ${schemaVersion}, ` +
        `and this version of the CLI only understands ${PLUGIN_CONFIG_SCHEMA_VERSION}`;
      return { state: 'unreadable', reason, path: this.configPath };
    }

    return PluginConfigPresent.create(parsed.config);
  }

  /**
   * Adds the plugin's identity, creating the file when absent. `license` is written unprompted
   * because the backend consumes it; `pluginKey` is deliberately not written, because nothing does.
   */
  public async upsertMetadata(metadata: PluginMetadata, author?: PluginAuthor): Promise<PluginConfigWriteResult> {
    return await this.merge((config) => ({
      ...config,
      pluginId: metadata.pluginId,
      pluginName: metadata.pluginName,
      pluginVersion: metadata.pluginVersion,
      ...(author && { author }),
      license: config.license ?? DEFAULT_PLUGIN_LICENSE
    }));
  }

  /** Adds one language, creating the file — with no metadata — when absent. */
  public async upsertLanguage(language: Language, entry: LanguageEntry): Promise<PluginConfigWriteResult> {
    return await this.merge((config) => ({
      ...config,
      languages: { ...config.languages, [language]: entry }
    }));
  }

  /**
   * Reads, applies, writes. A file that exists but cannot be parsed is left alone rather than
   * overwritten, and a write fault is reported rather than thrown: this runs after a publish that
   * already succeeded, and nothing here may turn that into a crash.
   */
  private async merge(apply: (config: PluginConfigData) => PluginConfigData): Promise<PluginConfigWriteResult> {
    const existing = await this.read();
    if ('reason' in existing) {
      return 'unreadable';
    }

    const merged = apply(existing.config);
    // A hand-written file may omit it, and the backend accepts only this one version.
    merged.schemaVersion = merged.schemaVersion ?? PLUGIN_CONFIG_SCHEMA_VERSION;

    try {
      await this.write(merged);
    } catch {
      return 'unwritable';
    }

    return 'written';
  }

  private async read(): Promise<ParseResult> {
    if (!(await this.fileService.fileExists(this.configPath))) {
      return { config: { schemaVersion: PLUGIN_CONFIG_SCHEMA_VERSION, languages: {} } };
    }
    return await this.parse();
  }

  private async parse(): Promise<ParseResult> {
    try {
      // TODO: JSON Parsing/Stringify should be in a dedicated JSON infra layer which preferably uses zod
      const parsed: unknown = JSON.parse(await this.fileService.getContents(this.configPath));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { reason: 'it is not a JSON object' };
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

