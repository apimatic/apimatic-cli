import { SemVersionString } from '../publish/version.js';
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

interface CSharpPackageConfig {
  packageId: string;
  version: SemVersionString;
}

interface JavaPackageConfig {
  groupId: string;
  artifactId: string;
  version: SemVersionString;
}

interface PhpPackageConfig {
  vendorName: string;
  projectName: string;
  version: SemVersionString;
}

interface NamedPackageConfig {
  name: string;
  version: SemVersionString;
}

type PythonPackageConfig = NamedPackageConfig;
type RubyPackageConfig = NamedPackageConfig;
type TypeScriptPackageConfig = NamedPackageConfig;

interface GoPackageConfig {
  packageName: string;
  version: SemVersionString;
}

interface PluginConfig<TPackage> {
  source?: LanguageSource;
  package?: TPackage;
  codegenVersion: CodeGenerationVersion;
}

interface PluginConfigForLanguage {
  [Language.CSHARP]: PluginConfig<CSharpPackageConfig>;
  [Language.JAVA]: PluginConfig<JavaPackageConfig>;
  [Language.PHP]: PluginConfig<PhpPackageConfig>;
  [Language.PYTHON]: PluginConfig<PythonPackageConfig>;
  [Language.RUBY]: PluginConfig<RubyPackageConfig>;
  [Language.TYPESCRIPT]: PluginConfig<TypeScriptPackageConfig>;
  [Language.GO]: PluginConfig<GoPackageConfig>;
}

/**
 * One language's entry. Carrying the language in the type is what stops an entry built for one
 * language from being filed under another.
 */
export type PluginLanguageEntry<L extends Language> = PluginConfigForLanguage[L];

export type PluginLanguages = Partial<PluginConfigForLanguage>;

export interface PluginConfigData {
  schemaVersion: number;
  // Optional on disk: `sdk publish` creates a config carrying languages alone, and
  // `plugin generate` fills the identity in before it ever uploads.
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
