import { CodeGenerationVersion, Language } from '../sdk/generate.js';

/** The only schema version the backend accepts. */
export const PLUGIN_CONFIG_SCHEMA_VERSION = 1;

/** Written unprompted: the backend consumes it, and nothing in the CLI asks for it. */
export const DEFAULT_PLUGIN_LICENSE = 'MIT';

export interface PluginAuthor {
  name: string;
  email?: string;
}

export interface LanguageSource {
  repositoryUrl: string;
  branch?: string;
}

export interface CSharpPluginPackage {
  packageId: string;
  packageUrl?: string;
}

/** Shared by typescript, python and ruby, which all identify a package by a single name. */
export interface NamedPluginPackage {
  name: string;
  packageUrl?: string;
}

export interface JavaPluginPackage {
  groupId: string;
  artifactId: string;
  packageUrl?: string;
}

export interface PhpPluginPackage {
  vendorName: string;
  projectName: string;
  packageUrl?: string;
}

export interface GoPluginPackage {
  packageName: string;
  packageUrl?: string;
}

export type PluginPackage =
  | CSharpPluginPackage
  | NamedPluginPackage
  | JavaPluginPackage
  | PhpPluginPackage
  | GoPluginPackage;

export interface LanguageEntry {
  source: LanguageSource;
  package?: PluginPackage;
  version?: CodeGenerationVersion;
}

/** The backend also accepts a bare source URL in place of an entry. Read, never written. */
export type LanguageValue = LanguageEntry | string;

export type PluginLanguages = Partial<Record<Language, LanguageValue>>;

export interface PluginConfigData {
  schemaVersion: number;
  // Optional on disk: `sdk publish` creates a config carrying languages alone, and
  // `plugin generate` fills these in before it ever uploads.
  pluginId?: string;
  pluginName?: string;
  pluginVersion?: string;
  // Read and preserved on a round-trip, never written: nothing in codegen-v2 consumes it.
  pluginKey?: string;
  author?: PluginAuthor;
  license?: string;
  homepage?: string;
  repository?: string;
  languages: PluginLanguages;
  // A hand-written config may carry fields this CLI version does not model; the index
  // signature is what lets a read-modify-write round-trip preserve them.
  [key: string]: unknown;
}

/** The fields the CLI asks for; everything else is derived or constant. */
export interface PluginMetadata {
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
}

export function isLanguageEntry(value: LanguageValue): value is LanguageEntry {
  return typeof value !== 'string';
}
