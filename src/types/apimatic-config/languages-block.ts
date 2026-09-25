import { isJsonObject, JsonObject } from '../../utils/json-utils.js';
import { GitConfiguration, PackageConfigurationForLanguage } from '../publish/package-settings-configuration.js';
import { SemVersion, SemVersionString } from '../publish/version.js';
import { Language } from '../sdk/generate.js';
import { ApimaticConfigDocument } from './document.js';

const GITHUB_BASE_URL = 'https://github.com';

export interface LanguageSource {
  repositoryUrl: string;
  branch?: string;
}

/** The package's name is not here: the service reads it from `packageConfiguration`. */
interface PackageRelease {
  version: SemVersionString;
}

interface LanguagePublishing<TConfiguration> {
  source?: LanguageSource;
  package?: PackageRelease;
  /** Optional because a profile can configure a repository without a package. */
  packageConfiguration?: TConfiguration;
}

export type LanguagePublishingEntry<L extends Language> = LanguagePublishing<PackageConfigurationForLanguage[L]>;

/** Without `publishing`, the language was asked for but nothing has been published yet. */
export interface PluginLanguageEntry<L extends Language> {
  publishing?: LanguagePublishingEntry<L>;
}

export type PluginLanguages = Partial<{ [L in Language]: PluginLanguageEntry<L> }>;

export const languagesOf = (document: ApimaticConfigDocument): PluginLanguages =>
  (document.languages() ?? {}) as PluginLanguages;

export const isPublished = (entry: PluginLanguageEntry<Language> | undefined): boolean =>
  Boolean(entry?.publishing?.source ?? entry?.publishing?.package);

export function buildLanguageEntry<L extends Language>(
  language: L,
  gitConfiguration: GitConfiguration | undefined,
  packageConfiguration: PackageConfigurationForLanguage[L] | undefined,
  packageVersion: SemVersion | undefined
): PluginLanguageEntry<L> {
  const repositoryName = gitConfiguration?.repositoryName?.trim();
  const source: LanguageSource | undefined = repositoryName
    ? {
        repositoryUrl: `${GITHUB_BASE_URL}/${repositoryName}`,
        branch: gitConfiguration?.branch ? gitConfiguration.branch : undefined
      }
    : undefined;

  return {
    publishing: {
      source,
      package: packageVersion ? { version: packageVersion.toString() } : undefined,
      // Written even without a release: it says how the package is set up, not that one exists.
      packageConfiguration
    }
  };
}

export function withLanguage<L extends Language>(
  languages: PluginLanguages,
  language: L,
  entry: PluginLanguageEntry<L>
): PluginLanguages {
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

  return { ...languages, [language]: { ...existingEntry, ...entry, ...(publishing ? { publishing } : {}) } };
}

export interface RecordedPublishing {
  repositoryUrl: string | null;
  version: string | null;
  packageConfiguration: Readonly<JsonObject>;
}

export function recordedPublishing(entry: unknown): RecordedPublishing {
  const publishing = objectAt<PluginLanguageEntry<Language>>(entry, 'publishing');
  const source = objectAt<LanguagePublishing<unknown>>(publishing, 'source');
  const release = objectAt<LanguagePublishing<unknown>>(publishing, 'package');

  return {
    repositoryUrl: stringAt<LanguageSource>(source, 'repositoryUrl'),
    version: stringAt<PackageRelease>(release, 'version'),
    packageConfiguration: objectAt<LanguagePublishing<unknown>>(publishing, 'packageConfiguration')
  };
}

// `T` only types `key`, so renaming a field fails to compile here instead of reading nothing.
function objectAt<T>(value: unknown, key: keyof T & string): JsonObject {
  const found = isJsonObject(value) ? value[key] : undefined;
  return isJsonObject(found) ? found : {};
}

function stringAt<T>(value: JsonObject, key: keyof T & string): string | null {
  const found = value[key];
  return typeof found === 'string' ? found : null;
}
