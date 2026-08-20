import { err, ok, Result } from 'neverthrow';
import { SemVersion, SemVersionString } from '../publish/version.js';

/** Also the rule the metadata prompt validates against, so a plugin ID is legal as a repository name. */
export const PLUGIN_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const TAG_PREFIX = 'v';

/** Which field a caller has to fix, and whether it is absent or present but unusable. */
export type PluginReleaseProblem = {
  field: 'pluginId' | 'pluginVersion';
  reason: 'missing' | 'malformed';
};

/**
 * The identity a publish needs: what the repository is called, and which version this release is.
 * Naming rules live here rather than in the prompts so the tag prefix has one definition.
 */
export class PluginRelease {
  private constructor(private readonly pluginId: string, private readonly version: SemVersion) {}

  public static create(
    pluginId: string | undefined,
    pluginVersion: string | undefined
  ): Result<PluginRelease, PluginReleaseProblem> {
    const id = pluginId?.trim();
    if (!id) {
      return err({ field: 'pluginId', reason: 'missing' });
    }
    if (!PLUGIN_ID_PATTERN.test(id)) {
      return err({ field: 'pluginId', reason: 'malformed' });
    }

    const rawVersion = pluginVersion?.trim();
    if (!rawVersion) {
      return err({ field: 'pluginVersion', reason: 'missing' });
    }

    const version = SemVersion.tryCreate(rawVersion);
    if (version.isErr()) {
      return err({ field: 'pluginVersion', reason: 'malformed' });
    }

    return ok(new PluginRelease(id, version.value));
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
}
