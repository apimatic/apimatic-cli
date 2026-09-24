import { PackageConfigurationForLanguage } from '../publish/package-settings-configuration.js';
import { SemVersionString } from '../publish/version.js';
import { Language } from '../sdk/generate.js';

/** Written unprompted: the backend consumes it, and nothing in the CLI asks for it. */
export const DEFAULT_PLUGIN_LICENSE = 'MIT';

/** Also the rule the metadata prompt validates against, so a plugin ID is legal as a repository name. */
export const PLUGIN_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface PluginAuthor {
  name: string;
  email?: string;
}

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

/** The `plugin` block of `apimatic.json`: the identity `plugin generate` records. */
export interface PluginIdentityData {
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
  // A hand-written config may carry fields this CLI version does not model; the index
  // signature is what lets a read-modify-write round-trip preserve them.
  [key: string]: unknown;
}

/** The identity with `languages` beside it: the one configuration the plugin commands judge. */
export interface PluginConfigData extends PluginIdentityData {
  languages: PluginLanguages;
}

/** The fields the CLI asks for; everything else is derived, resolved or constant. */
export interface PluginMetadata {
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
}

const FIRST_VERSION = '0.1.0';
const FALLBACK_ID = 'api-plugin';

/**
 * A plugin identity taken from the directory the user is working in, for the flow that may not
 * ask: quickstart has two questions and neither of them is about plugins.
 *
 * `pluginId` has to match `PLUGIN_ID_PATTERN`, which a directory name need not — `Acme Payments`
 * and `acme_payments!` are both ordinary folder names and neither is kebab-case. A name that
 * survives none of that leaves nothing to publish under, so it falls back rather than writing an
 * id the config would then refuse.
 */
export function deriveMetadata(directoryName: string): PluginMetadata {
  const pluginId = directoryName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    pluginId: PLUGIN_ID_PATTERN.test(pluginId) ? pluginId : FALLBACK_ID,
    pluginName: directoryName.trim() === '' ? FALLBACK_ID : directoryName.trim(),
    pluginVersion: FIRST_VERSION
  };
}
