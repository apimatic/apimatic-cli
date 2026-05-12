import {
  JavaDeveloper,
  JavaDistributionManagement,
  JavaScm,
  PhpAuthor,
  PhpSupport,
  PythonConfigurationItem,
  PythonPerson,
  RubyConfigurationItem,
  TsBugs,
  TsPerson,
  TsRepository
} from '../publish-api/publishing-profile-item.js';

interface CSharpPackageConfiguration {
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

interface JavaPackageConfiguration {
  groupId: string;
  artifactId: string;
  name: string;
  description: string;
  url: string;
  developers: JavaDeveloper[];
  distributionManagement: JavaDistributionManagement;
  scm: JavaScm;
}

interface PhpPackageConfiguration {
  vendorName: string;
  projectName: string;
  description: string;
  type: string | null;
  keywords: string[];
  homepage: string | null;
  authors: PhpAuthor[];
  support: PhpSupport;
}

interface PythonPackageConfiguration {
  name: string;
  description: string | null;
  authors: PythonPerson[];
  maintainers: PythonPerson[];
  keywords: string[];
  classifiers: string[];
  urls: Record<string, string>;
}

export function createPythonConfiguration(item: PythonConfigurationItem): PythonPackageConfiguration {
  const { name, description, authors, maintainers, keywords, classifiers, urls } = item;
  return { name, description, authors, maintainers, keywords, classifiers, urls: Object.fromEntries(urls.map(({ key, value }) => [key, value])) };
}

interface RubyPackageConfiguration {
  name: string;
  authors: string[];
  summary: string;
  description: string | null;
  email: string[];
  homepage: string | null;
  metadata: Record<string, string>;
  postInstallMessage: string | null;
  requirements: string[];
}

export function createRubyConfiguration(item: RubyConfigurationItem): RubyPackageConfiguration {
  const { name, authors, summary, description, email, homepage, metadata, postInstallMessage, requirements } = item;
  return { name, authors, summary, description, email, homepage, metadata: Object.fromEntries(metadata.map(({ key, value }) => [key, value])), postInstallMessage, requirements };
}

interface TypeScriptPackageConfiguration {
  name: string;
  author: TsPerson;
  description: string | null;
  contributors: TsPerson[];
  bugs: TsBugs;
  keywords: string[];
  homepage: string | null;
  repository: TsRepository;
}

interface GoPackageConfiguration {
  packageName: string;
}

export type PackageConfigurationData =
  | CSharpPackageConfiguration
  | JavaPackageConfiguration
  | PhpPackageConfiguration
  | PythonPackageConfiguration
  | RubyPackageConfiguration
  | TypeScriptPackageConfiguration
  | GoPackageConfiguration;
