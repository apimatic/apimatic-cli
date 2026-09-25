import { PluginLanguages } from '../apimatic-config/languages-block.js';

/** Written unprompted: the backend consumes it, and nothing in the CLI asks for it. */
export const DEFAULT_PLUGIN_LICENSE = 'MIT';

/** Also the rule the metadata prompt validates against, so a plugin ID is legal as a repository name. */
export const PLUGIN_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface PluginAuthor {
  name: string;
  email?: string;
}

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

export const PLACEHOLDER_METADATA: Readonly<PluginMetadata> = Object.freeze({
  pluginId: 'my-api-plugin',
  pluginName: 'My API Plugin',
  pluginVersion: '0.1.0'
});
