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
import { LanguageEntry, PluginPackage } from './plugin-config.js';

const GITHUB_BASE_URL = 'https://github.com';

export function buildLanguageEntry(
  language: Language,
  gitConfiguration: GitConfiguration | undefined,
  packageConfiguration: PackageConfigurationData | undefined,
  version: CodeGenerationVersion
): LanguageEntry {
  const repositoryName = gitConfiguration?.repositoryName?.trim();
  const sourceConfig = repositoryName ? {
      repositoryUrl: `${GITHUB_BASE_URL}/${repositoryName}`,
      branch: gitConfiguration?.branch ? gitConfiguration.branch : undefined
  } : undefined;

  const packageConfig = packageOf(language, packageConfiguration);

  return {
    source: sourceConfig,
    package: packageConfig,
    version
  };
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
