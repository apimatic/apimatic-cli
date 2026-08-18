import {
  CSharpPackageConfiguration,
  GitConfiguration,
  GoPackageConfiguration,
  JavaPackageConfiguration,
  PackageConfigurationData,
  PhpPackageConfiguration,
  PythonPackageConfiguration,
  RubyPackageConfiguration,
  TypeScriptPackageConfiguration
} from '../publish/package-settings-configuration.js';
import { CodeGenerationVersion, Language } from '../sdk/generate.js';
import { LanguageEntry, LanguageSource, PluginPackage } from './plugin-config.js';

const GITHUB_BASE_URL = 'https://github.com';

/**
 * `noSourceRepository` is routine rather than a fault: the run published no source code, so there
 * is nothing for a language entry to describe. `unresolvableRepositoryName` is the opposite — a
 * repository is configured, but its name is not a shape that can be turned into a URL, and a guess
 * would be written as a clone target that only fails once the backend tries to use it.
 */
export type LanguageEntryResult =
  | { kind: 'entry'; entry: LanguageEntry }
  | { kind: 'noSourceRepository' };

export function buildLanguageEntry(
  language: Language,
  gitConfiguration: GitConfiguration | undefined,
  packageConfiguration: PackageConfigurationData | undefined,
  version: CodeGenerationVersion
): LanguageEntryResult {
  const repositoryName = gitConfiguration?.repositoryName?.trim();
  if (!repositoryName) {
    return { kind: 'noSourceRepository' };
  }

  const source: LanguageSource = {
    repositoryUrl: `${GITHUB_BASE_URL}/${repositoryName}`,
    branch: gitConfiguration?.branch ? gitConfiguration.branch : undefined
  };

  const entry: LanguageEntry = { source, version };
  const pluginPackage = packageOf(language, packageConfiguration);
  if (pluginPackage) {
    entry.package = pluginPackage;
  }

  return { kind: 'entry', entry };
}

function packageOf(language: Language, configuration: PackageConfigurationData | undefined): PluginPackage | undefined {
  if (!configuration) {
    return undefined;
  }

  switch (language) {
    case Language.CSHARP: {
      const { packageId } = configuration as CSharpPackageConfiguration;
      return packageId ? { packageId } : undefined;
    }
    case Language.JAVA: {
      const { groupId, artifactId } = configuration as JavaPackageConfiguration;
      return groupId && artifactId ? { groupId, artifactId } : undefined;
    }
    case Language.PHP: {
      const { vendorName, projectName } = configuration as PhpPackageConfiguration;
      return vendorName && projectName ? { vendorName, projectName } : undefined;
    }
    case Language.GO: {
      const { packageName } = configuration as GoPackageConfiguration;
      return packageName ? { packageName } : undefined;
    }
    case Language.PYTHON:
    case Language.RUBY:
    case Language.TYPESCRIPT: {
      const { name } = configuration as
        | PythonPackageConfiguration
        | RubyPackageConfiguration
        | TypeScriptPackageConfiguration;
      return name ? { name } : undefined;
    }
  }
}
