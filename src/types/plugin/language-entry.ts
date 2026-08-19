import { GitConfiguration, PackageConfigurationForLanguage } from '../publish/package-settings-configuration.js';
import { SemVersion, SemVersionString } from '../publish/version.js';
import { CodeGenerationVersion, Language } from '../sdk/generate.js';
import { LanguageSource, PluginLanguageEntry } from './plugin-config.js';

const GITHUB_BASE_URL = 'https://github.com';

type LanguageEntryBuilder<L extends Language> = (
  source: LanguageSource | undefined,
  packageConfiguration: PackageConfigurationForLanguage[L] | undefined,
  version: SemVersionString,
  codegenVersion: CodeGenerationVersion
) => PluginLanguageEntry<L>;

/**
 * One builder per language, each checked against that language's own profile fields and its own
 * entry shape. A single builder taking every language's configuration at once can only reach those
 * fields through a cast, which is what let a mismatched pair compile.
 */
const languageEntryBuilders: { [L in Language]: LanguageEntryBuilder<L> } = {
  [Language.CSHARP]: (source, configuration, version, codegenVersion) => ({
    source,
    package: configuration?.packageId ? { packageId: configuration.packageId, version } : undefined,
    codegenVersion
  }),
  [Language.JAVA]: (source, configuration, version, codegenVersion) => ({
    source,
    package:
      configuration?.groupId && configuration.artifactId
        ? { groupId: configuration.groupId, artifactId: configuration.artifactId, version }
        : undefined,
    codegenVersion
  }),
  [Language.PHP]: (source, configuration, version, codegenVersion) => ({
    source,
    package:
      configuration?.vendorName && configuration.projectName
        ? { vendorName: configuration.vendorName, projectName: configuration.projectName, version }
        : undefined,
    codegenVersion
  }),
  [Language.PYTHON]: (source, configuration, version, codegenVersion) => ({
    source,
    package: configuration?.name ? { name: configuration.name, version } : undefined,
    codegenVersion
  }),
  [Language.RUBY]: (source, configuration, version, codegenVersion) => ({
    source,
    package: configuration?.name ? { name: configuration.name, version } : undefined,
    codegenVersion
  }),
  [Language.TYPESCRIPT]: (source, configuration, version, codegenVersion) => ({
    source,
    package: configuration?.name ? { name: configuration.name, version } : undefined,
    codegenVersion
  }),
  [Language.GO]: (source, configuration, version, codegenVersion) => ({
    source,
    package: configuration?.packageName ? { packageName: configuration.packageName, version } : undefined,
    codegenVersion
  })
};

/**
 * A publish records one half of an entry at a time, so the half this run did not publish is carried
 * over from what is already on disk rather than dropped: a package-only run must not erase the
 * repository an earlier source-only run recorded, nor the other way round. `codegenVersion` is not
 * a half — it always describes the generator this run used.
 */
export function mergeLanguageEntry<L extends Language>(
  recorded: PluginLanguageEntry<L> | undefined,
  published: PluginLanguageEntry<L>
): PluginLanguageEntry<L> {
  return {
    ...recorded,
    ...published,
    source: published.source ?? recorded?.source,
    package: published.package ?? recorded?.package
  };
}

/**
 * The version rides inside the package block, so a source-only publish records no version at all —
 * there is no package for it to describe.
 */
export function buildLanguageEntry<L extends Language>(
  language: L,
  gitConfiguration: GitConfiguration | undefined,
  packageConfiguration: PackageConfigurationForLanguage[L] | undefined,
  packageVersion: SemVersion,
  codegenVersion: CodeGenerationVersion
): PluginLanguageEntry<L> {
  const repositoryName = gitConfiguration?.repositoryName?.trim();
  const source = repositoryName
    ? {
        repositoryUrl: `${GITHUB_BASE_URL}/${repositoryName}`,
        branch: gitConfiguration?.branch ? gitConfiguration.branch : undefined
      }
    : undefined;

  return languageEntryBuilders[language](source, packageConfiguration, packageVersion.toString(), codegenVersion);
}
