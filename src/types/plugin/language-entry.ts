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
import { SemVersion } from '../publish/version.js';
import { CodeGenerationVersion, Language } from '../sdk/generate.js';
import { PluginLanguages } from './plugin-config.js';

const GITHUB_BASE_URL = 'https://github.com';

/**
 * Keyed by the language it describes, so each branch below is checked against that one language's
 * config rather than against every language's at once.
 *
 * The version rides inside the package block, so a source-only publish records no version at all —
 * there is no package for it to describe.
 */
export function buildLanguageEntry(
  language: Language,
  gitConfiguration: GitConfiguration | undefined,
  packageConfiguration: PackageConfigurationData | undefined,
  packageVersion: SemVersion,
  codegenVersion: CodeGenerationVersion
): PluginLanguages {
  const repositoryName = gitConfiguration?.repositoryName?.trim();
  const source = repositoryName
    ? {
        repositoryUrl: `${GITHUB_BASE_URL}/${repositoryName}`,
        branch: gitConfiguration?.branch ? gitConfiguration.branch : undefined
      }
    : undefined;

  // The config is JSON on disk, so the version unwraps to its string form here.
  const version = packageVersion.toString();

  switch (language) {
    case Language.CSHARP: {
      const { packageId } = fieldsOf<CSharpPackageConfiguration>(packageConfiguration);
      return { csharp: { source, package: packageId ? { packageId, version } : undefined, codegenVersion } };
    }
    case Language.JAVA: {
      const { groupId, artifactId } = fieldsOf<JavaPackageConfiguration>(packageConfiguration);
      const artifact = groupId && artifactId ? { groupId, artifactId, version } : undefined;
      return { java: { source, package: artifact, codegenVersion } };
    }
    case Language.PHP: {
      const { vendorName, projectName } = fieldsOf<PhpPackageConfiguration>(packageConfiguration);
      const artifact = vendorName && projectName ? { vendorName, projectName, version } : undefined;
      return { php: { source, package: artifact, codegenVersion } };
    }
    case Language.PYTHON: {
      const { name } = fieldsOf<PythonPackageConfiguration>(packageConfiguration);
      return { python: { source, package: name ? { name, version } : undefined, codegenVersion } };
    }
    case Language.RUBY: {
      const { name } = fieldsOf<RubyPackageConfiguration>(packageConfiguration);
      return { ruby: { source, package: name ? { name, version } : undefined, codegenVersion } };
    }
    case Language.TYPESCRIPT: {
      const { name } = fieldsOf<TypeScriptPackageConfiguration>(packageConfiguration);
      return { typescript: { source, package: name ? { name, version } : undefined, codegenVersion } };
    }
    case Language.GO: {
      const { packageName } = fieldsOf<GoPackageConfiguration>(packageConfiguration);
      return { go: { source, package: packageName ? { packageName, version } : undefined, codegenVersion } };
    }
  }
}

/** Absent configuration destructures to absent fields, which is what leaves the package block off. */
function fieldsOf<T>(configuration: PackageConfigurationData | undefined): Partial<T> {
  return (configuration ?? {}) as Partial<T>;
}
