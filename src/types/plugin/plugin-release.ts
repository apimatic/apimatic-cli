import { err, ok, Result } from 'neverthrow';
import { SemVersion, SemVersionString } from '../publish/version.js';

/** Also the rule the metadata prompt validates against, so a plugin ID is legal as a repository name. */
export const PLUGIN_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const TAG_PREFIX = 'v';

const MALFORMED_PLUGIN_ID =
  `its 'pluginId' must be lower-case alphanumeric words separated by single dashes, ` +
  `for example 'acme-payments'`;

const MALFORMED_PLUGIN_VERSION =
  `its 'pluginVersion' must be a version in the format major.minor.patch, for example '0.1.0'`;

/** Naming rules live here rather than in the prompts so the tag prefix has one definition. */
export class PluginRelease {
  private constructor(private readonly pluginId: string, private readonly version: SemVersion) {}

  /**
   * An absent field yields `undefined` rather than an error: `sdk publish` writes a config carrying
   * languages alone, which `plugin generate` then fills the identity into. A field that is present
   * but unusable can only have been hand-edited, so it is reported for the caller to refuse the
   * whole file over.
   */
  public static tryCreate(pluginId: unknown, pluginVersion: unknown): Result<PluginRelease | undefined, string> {
    const id = PluginRelease.trimmed(pluginId);
    if (id !== '' && !PLUGIN_ID_PATTERN.test(id)) {
      return err(MALFORMED_PLUGIN_ID);
    }

    const rawVersion = PluginRelease.trimmed(pluginVersion);
    if (rawVersion !== '') {
      const version = SemVersion.tryCreate(rawVersion);
      if (version.isErr()) {
        return err(MALFORMED_PLUGIN_VERSION);
      }
      if (id !== '') {
        return ok(new PluginRelease(id, version.value));
      }
    }

    return ok(undefined);
  }

  public toRepositoryName(): string {
    return this.pluginId;
  }

  public toVersion(): SemVersionString {
    return this.version.toString();
  }

  public toTag(): string {
    return `${TAG_PREFIX}${this.version}`;
  }

  private static trimmed(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
