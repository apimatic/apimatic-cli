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
}

/** Shared by typescript, python and ruby, which all identify a package by a single name. */
export interface NamedPluginPackage {
  name: string;
}

export interface JavaPluginPackage {
  groupId: string;
  artifactId: string;
}

export interface PhpPluginPackage {
  vendorName: string;
  projectName: string;
}

export interface GoPluginPackage {
  packageName: string;
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
  version: CodeGenerationVersion;
}

export type PluginLanguages = Partial<Record<Language, LanguageEntry>>;

export interface PluginConfigData {
  schemaVersion: number;
  // Optional on disk: `sdk publish` creates a config carrying languages alone, and
  // `plugin generate` fills these in — all four together — before it ever uploads. `pluginKey` is
  // the account's API Copilot key, which is why publishing cannot write it: resolving one costs an
  // account call, and picking between several needs a prompt the CI path could not answer.
  pluginId?: string;
  pluginName?: string;
  pluginVersion?: string;
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

/** The fields the CLI asks for; everything else is derived, resolved or constant. */
export interface PluginMetadata {
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
}
