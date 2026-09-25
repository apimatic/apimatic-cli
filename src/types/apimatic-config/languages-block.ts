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

/** What a release recorded about itself. The package's name is in `packageConfiguration`. */
interface PackageRelease {
  version: SemVersionString;
}

/**
 * Where one language's SDK went and how its package is configured.
 *
 * `packageConfiguration` is the profile's own settings, written through: the service reads the
 * package's name out of it, so it is what a published entry is identified by. The service
 * requires it beside any `publishing` block; it is optional here only because a profile can
 * configure a repository and no package, and losing the repository would be worse than writing
 * an entry the service then refuses.
 */
interface LanguagePublishing<TConfiguration> {
  source?: LanguageSource;
  package?: PackageRelease;
  packageConfiguration?: TConfiguration;
}

export type LanguagePublishingEntry<L extends Language> = LanguagePublishing<PackageConfigurationForLanguage[L]>;

/**
 * One language's entry. The publishing record nests under `publishing` because the entry is
 * shared state — the plugin's skills, the portal's SDK page and publishing all read it — so the
 * rest of the entry has to stay free for settings that are not about publishing. The backend
 * binds this level, and an entry with no `publishing` block is how "this language was asked for,
 * nothing has been published yet" is expressed.
 */
export interface PluginLanguageEntry<L extends Language> {
  publishing?: LanguagePublishingEntry<L>;
}

export type PluginLanguages = Partial<{ [L in Language]: PluginLanguageEntry<L> }>;

export const languagesOf = (document: ApimaticConfigDocument): PluginLanguages =>
  (document.languages() ?? {}) as PluginLanguages;

/** Published means a reader can reach the SDK: a repository, a registry, or both. */
export const isPublished = (entry: PluginLanguageEntry<Language> | undefined): boolean =>
  Boolean(entry?.publishing?.source ?? entry?.publishing?.package);

/**
 * What a publish records about one language. The profile's package configuration is written
 * through as it stands — the service reads the package's name out of it, so it is what identifies
 * a published package, and every language's settings are its own shape.
 *
 * The version rides in `package`, which a source-only publish leaves out: nothing was released
 * for it to describe. The configuration is written either way, because it says how the package is
 * set up rather than that one exists.
 */
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
      packageConfiguration
    }
  };
}

/**
 * What a run published is added to what the entry already holds: a package-only run leaves the
 * repository a previous source publish recorded, and the other way about.
 */
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

/** An entry's publishing record as read off disk, each field null when it is absent or wrongly shaped. */
export interface RecordedPublishing {
  repositoryUrl: string | null;
  version: string | null;
  packageConfiguration: Readonly<JsonObject>;
}

/**
 * Read leniently below `publishing`, which is as deep as the document checks shapes. Each key is
 * named against the type it belongs to, so renaming a field there fails to compile here rather
 * than reading nothing.
 */
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

function objectAt<T>(value: unknown, key: keyof T & string): JsonObject {
  const found = isJsonObject(value) ? value[key] : undefined;
  return isJsonObject(found) ? found : {};
}

function stringAt<T>(value: JsonObject, key: keyof T & string): string | null {
  const found = value[key];
  return typeof found === 'string' ? found : null;
}
