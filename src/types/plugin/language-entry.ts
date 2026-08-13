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

const ABSOLUTE_HTTP_URL = /^https?:\/\//i;
const GITHUB_BASE_URL = 'https://github.com';

/**
 * `noSourceRepository` is routine rather than a fault: a package-only publishing profile has no
 * repository configured, and a language entry cannot describe an SDK without one.
 */
export type LanguageEntryResult = { kind: 'entry'; entry: LanguageEntry } | { kind: 'noSourceRepository' };

export function buildLanguageEntry(
  language: Language,
  gitConfiguration: GitConfiguration | undefined,
  packageConfiguration: PackageConfigurationData | undefined,
  version: CodeGenerationVersion
): LanguageEntryResult {
  const source = sourceOf(gitConfiguration);
  if (!source) {
    return { kind: 'noSourceRepository' };
  }

  const entry: LanguageEntry = { source, version };
  const pluginPackage = packageOf(language, packageConfiguration);
  if (pluginPackage) {
    entry.package = pluginPackage;
  }

  return { kind: 'entry', entry };
}

function sourceOf(gitConfiguration: GitConfiguration | undefined): LanguageSource | undefined {
  const repositoryName = gitConfiguration?.repositoryName?.trim();
  if (!repositoryName) {
    return undefined;
  }

  const source: LanguageSource = { repositoryUrl: repositoryUrlOf(repositoryName) };
  const branch = gitConfiguration?.branch?.trim();
  if (branch) {
    source.branch = branch;
  }

  return source;
}

/** Publishing profiles target GitHub, so a repository named without a host resolves against it. */
function repositoryUrlOf(repositoryName: string): string {
  if (ABSOLUTE_HTTP_URL.test(repositoryName)) {
    return repositoryName;
  }
  return `${GITHUB_BASE_URL}/${repositoryName.replace(/^\/+/, '').replace(/\/+$/, '')}`;
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
