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
  | { state: 'present'; hasMetadata: boolean; hasLanguages: boolean };

type ParseResult = { config: PluginConfigData } | { reason: string };

export class PluginConfigContext {
  private readonly fileService = new FileService();

  constructor(private readonly buildDirectory: DirectoryPath) {}

  private get configPath(): FilePath {
    return new FilePath(this.buildDirectory, new FileName('plugin-config.json'));
  }

  public async validate(): Promise<PluginConfigState> {
    if (!(await this.fileService.fileExists(this.configPath))) {
      return { state: 'missing' };
    }

    const parsed = await this.parse();
    if ('reason' in parsed) {
      return { state: 'unreadable', reason: parsed.reason, path: this.configPath };
    }

    return {
      state: 'present',
      hasMetadata: namesThePlugin(parsed.config),
      hasLanguages: namesAnyLanguage(parsed.config)
    };
  }

  /**
   * Adds the plugin's identity, creating the file when absent. `license` is written unprompted
   * because the backend consumes it; `pluginKey` is deliberately not written, because nothing does.
   */
  public async upsertMetadata(metadata: PluginMetadata, author?: PluginAuthor): Promise<boolean> {
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
  public async upsertLanguage(language: Language, entry: LanguageEntry): Promise<boolean> {
    return await this.merge((config) => ({
      ...config,
      languages: { ...config.languages, [language]: entry }
    }));
  }

  /**
   * Reads, applies, writes. Returns false only when the file exists but could not be parsed, so a
   * caller can stay silent rather than overwrite something the user wrote by hand.
   */
  private async merge(apply: (config: PluginConfigData) => PluginConfigData): Promise<boolean> {
    const existing = await this.read();
    if ('reason' in existing) {
      return false;
    }

    await this.write(apply(existing.config));
    return true;
  }

  private async read(): Promise<ParseResult> {
    if (!(await this.fileService.fileExists(this.configPath))) {
      return { config: { schemaVersion: PLUGIN_CONFIG_SCHEMA_VERSION, languages: {} } };
    }
    return await this.parse();
  }

  private async parse(): Promise<ParseResult> {
    try {
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

const namesThePlugin = (config: PluginConfigData): boolean =>
  Boolean(config.pluginId?.trim()) && Boolean(config.pluginName?.trim());

const namesAnyLanguage = (config: PluginConfigData): boolean => {
  const languages = config.languages;
  return typeof languages === 'object' && languages !== null && Object.keys(languages).length > 0;
};
