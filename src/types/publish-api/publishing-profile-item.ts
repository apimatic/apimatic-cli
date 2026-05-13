import { Language } from '../sdk/generate.js';

export enum PublishType {
  PackagePublishing = 'package',
  SourceCodePublishing = 'sourcecode'
}

export interface KeyValueItem {
  key: string;
  value: string;
}

export interface GitConfigurationItem {
  isEnabled: boolean;
  credentialsId: string;
  repositoryName: string;
  branch: string;
}

export interface CSharpConfigurationItem {
  isEnabled: boolean;
  credentialsId: string;
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

export interface GoConfigurationItem {
  isEnabled: boolean;
  credentialsId: string;
  packageName: string;
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

export interface JavaConfigurationItem {
  isEnabled: boolean;
  credentialsId: string;
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

export interface PhpConfigurationItem {
  isEnabled: boolean;
  credentialsId: string;
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

export interface PythonConfigurationItem {
  isEnabled: boolean;
  credentialsId: string;
  name: string;
  description: string | null;
  authors: PythonPerson[];
  maintainers: PythonPerson[];
  keywords: string[];
  classifiers: string[];
  urls: KeyValueItem[];
}

export interface RubyConfigurationItem {
  isEnabled: boolean;
  credentialsId: string;
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

export interface TypeScriptConfigurationItem {
  isEnabled: boolean;
  credentialsId: string;
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
  apiGroupId: string;
  apiGroupName: string;
  cSharpConfiguration: CSharpConfigurationItem | null;
  goConfiguration: GoConfigurationItem | null;
  javaConfiguration: JavaConfigurationItem | null;
  phpConfiguration: PhpConfigurationItem | null;
  pythonConfiguration: PythonConfigurationItem | null;
  rubyConfiguration: RubyConfigurationItem | null;
  typeScriptConfiguration: TypeScriptConfigurationItem | null;
  cSharpGitConfiguration: GitConfigurationItem | null;
  goGitConfiguration: GitConfigurationItem | null;
  javaGitConfiguration: GitConfigurationItem | null;
  phpGitConfiguration: GitConfigurationItem | null;
  pythonGitConfiguration: GitConfigurationItem | null;
  rubyGitConfiguration: GitConfigurationItem | null;
  typeScriptGitConfiguration: GitConfigurationItem | null;
}

export interface PublishingProfileWithLanguages {
  profile: PublishingProfileItem;
  enabledLanguages: Language[];
}

export interface PublishingProfileWithLanguagesGroup {
  apiGroupName: string;
  profiles: PublishingProfileWithLanguages[];
}

export interface PublishingProfileSummary {
  name: string;
  id: string;
  enabledLanguages: Language[];
}

export interface PublishingProfileSummaryGroup {
  apiGroupName: string;
  profiles: PublishingProfileSummary[];
}
