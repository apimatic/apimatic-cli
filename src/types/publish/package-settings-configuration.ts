import {
  JavaDeveloper,
  JavaDistributionManagement,
  JavaScm,
  PhpAuthor,
  PhpSupport,
  PythonPerson,
  TsBugs,
  TsPerson,
  TsRepository
} from '../publish-api/publishing-profile-item.js';

export interface CSharpPackageConfiguration {
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

export interface JavaPackageConfiguration {
  groupId: string;
  artifactId: string;
  name: string;
  description: string;
  url: string;
  developers: JavaDeveloper[];
  distributionManagement: JavaDistributionManagement;
  scm: JavaScm;
}

export interface PhpPackageConfiguration {
  vendorName: string;
  projectName: string;
  description: string;
  type: string | null;
  keywords: string[];
  homepage: string | null;
  authors: PhpAuthor[];
  support: PhpSupport;
}

export interface PythonPackageConfiguration {
  name: string;
  description: string | null;
  authors: PythonPerson[];
  maintainers: PythonPerson[];
  keywords: string[];
  classifiers: string[];
  urls: Record<string, string>;
}

export interface RubyPackageConfiguration {
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

export interface TypeScriptPackageConfiguration {
  name: string;
  author: TsPerson;
  description: string | null;
  contributors: TsPerson[];
  bugs: TsBugs;
  keywords: string[];
  homepage: string | null;
  repository: TsRepository;
}

export interface GoPackageConfiguration {
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
