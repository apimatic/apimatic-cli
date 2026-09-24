import { GitConfiguration, PackageConfigurationForLanguage } from '../publish/package-settings-configuration.js';
import { SemVersion } from '../publish/version.js';
import { Language } from '../sdk/generate.js';
import { LanguageSource, PluginLanguageEntry } from './plugin-config.js';

const GITHUB_BASE_URL = 'https://github.com';

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
