import { Language } from '../sdk/generate.js';

export interface KeyValueItem {
  key: string;
  value: string;
}

export interface BaseConfigurationItem {
  isEnabled: boolean;
  credentialsId: string;
}

export interface GitConfigurationItem extends BaseConfigurationItem {
  repositoryName: string;
  branch: string;
}

export interface CSharpConfigurationItem extends BaseConfigurationItem {
  packageId: string;
  authors: string | null;
  description: string | null;
  title: string | null;
  packageTags: string | null;
  repositoryUrl: string | null;
  repositoryType: string | null;
  packageProjectUrl: string | null;
  packageIcon: string | null;
  packageReleaseNotes: string | null;
  copyright: string | null;
}

export interface GoConfigurationItem extends BaseConfigurationItem {
  repositoryName: string;
  branch: string;
}

export interface JavaDeveloper {
  name: string;
  email: string;
  organization: string | null;
  organizationUrl: string | null;
}

export interface JavaSnapShotRepository {
  id: string;
  name: string | null;
  url: string | null;
}

export interface JavaDistributionManagement {
  snapShotRepository: JavaSnapShotRepository;
}

export interface JavaScm {
  connection: string;
  developerConnection: string;
  url: string;
}

export interface JavaConfigurationItem extends BaseConfigurationItem {
  groupId: string;
  artifactId: string;
  name: string;
  description: string;
  url: string;
  developers: JavaDeveloper[];
  distributionManagement: JavaDistributionManagement;
  scm: JavaScm;
}

export interface PhpAuthor {
  name: string | null;
  email: string | null;
  homepage: string | null;
  role: string | null;
}

export interface PhpSupport {
  email: string | null;
  issues: string | null;
  forum: string | null;
  wiki: string | null;
  irc: string | null;
  chat: string | null;
  source: string | null;
  docs: string | null;
  rss: string | null;
}

export interface PhpConfigurationItem extends BaseConfigurationItem {
  gitCredentialsId: string;
  repositoryName: string;
  branchName: string;
  vendorName: string;
  projectName: string;
  description: string;
  type: string | null;
  keywords: string[];
  homepage: string | null;
  authors: PhpAuthor[];
  support: PhpSupport;
  releaseNotes: string | null;
}

export interface PythonPerson {
  email: string | null;
  name: string | null;
}

export interface PythonConfigurationItem extends BaseConfigurationItem {
  name: string;
  description: string | null;
  authors: PythonPerson[];
  maintainers: PythonPerson[];
  keywords: string[];
  classifiers: string[];
  urls: KeyValueItem[];
}

export interface RubyConfigurationItem extends BaseConfigurationItem {
  name: string;
  authors: string[];
  summary: string;
  description: string | null;
  email: string[];
  homepage: string | null;
  metadata: KeyValueItem[];
  postInstallMessage: string | null;
  requirements: string[];
}

export interface SwiftConfigurationItem extends BaseConfigurationItem {
  repositoryName: string;
  branch: string;
}

export interface TsPerson {
  name: string | null;
  email: string | null;
  url: string | null;
}

export interface TsBugs {
  url: string | null;
  email: string | null;
}

export interface TsRepository {
  type: string | null;
  url: string | null;
  directory: string | null;
}

export interface TypeScriptConfigurationItem extends BaseConfigurationItem {
  name: string;
  author: TsPerson;
  description: string | null;
  contributors: TsPerson[];
  bugs: TsBugs;
  keywords: string[];
  homepage: string | null;
  repository: TsRepository;
}

export interface PublishingProfileItem {
  id: string;
  name: string;
  cSharpConfiguration: CSharpConfigurationItem | null;
  goConfiguration: GoConfigurationItem | null;
  javaConfiguration: JavaConfigurationItem | null;
  phpConfiguration: PhpConfigurationItem | null;
  pythonConfiguration: PythonConfigurationItem | null;
  rubyConfiguration: RubyConfigurationItem | null;
  swiftConfiguration: SwiftConfigurationItem | null;
  typeScriptConfiguration: TypeScriptConfigurationItem | null;
  cSharpGitConfiguration: GitConfigurationItem | null;
  goGitConfiguration: GitConfigurationItem | null;
  javaGitConfiguration: GitConfigurationItem | null;
  phpGitConfiguration: GitConfigurationItem | null;
  pythonGitConfiguration: GitConfigurationItem | null;
  rubyGitConfiguration: GitConfigurationItem | null;
  swiftGitConfiguration: GitConfigurationItem | null;
  typeScriptGitConfiguration: GitConfigurationItem | null;
}

export interface LanguageConfig {
  language: Language;
  config: BaseConfigurationItem | null;
  gitConfig: BaseConfigurationItem | null;
}

export function getLanguageConfigs(profile: PublishingProfileItem): LanguageConfig[] {
  return [
    { language: Language.CSHARP, config: profile.cSharpConfiguration, gitConfig: profile.cSharpGitConfiguration },
    { language: Language.JAVA, config: profile.javaConfiguration, gitConfig: profile.javaGitConfiguration },
    { language: Language.GO, config: profile.goConfiguration, gitConfig: profile.goGitConfiguration },
    { language: Language.PHP, config: profile.phpConfiguration, gitConfig: profile.phpGitConfiguration },
    { language: Language.PYTHON, config: profile.pythonConfiguration, gitConfig: profile.pythonGitConfiguration },
    { language: Language.RUBY, config: profile.rubyConfiguration, gitConfig: profile.rubyGitConfiguration },
    {
      language: Language.TYPESCRIPT,
      config: profile.typeScriptConfiguration,
      gitConfig: profile.typeScriptGitConfiguration
    }
  ];
}

export function hasEnabledLanguage(profile: PublishingProfileItem): boolean {
  return getLanguageConfigs(profile).some(({ config, gitConfig }) => config?.isEnabled || gitConfig?.isEnabled);
}
