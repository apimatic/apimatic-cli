import { Language } from '../sdk/generate.js';
import {
  BaseConfigurationItem,
  CSharpConfigurationItem,
  JavaConfigurationItem,
  JavaDeveloper,
  JavaDistributionManagement,
  JavaScm,
  KeyValueItem,
  PhpAuthor,
  PhpConfigurationItem,
  PhpSupport,
  PythonConfigurationItem,
  PythonPerson,
  RubyConfigurationItem,
  TsBugs,
  TsPerson,
  TsRepository,
  TypeScriptConfigurationItem
} from './publishing-profile.js';

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
  urls: KeyValueItem[];
}

export interface RubyPackageConfiguration {
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

export type PackageConfiguration =
  | CSharpPackageConfiguration
  | JavaPackageConfiguration
  | PhpPackageConfiguration
  | PythonPackageConfiguration
  | RubyPackageConfiguration
  | TypeScriptPackageConfiguration;

export function toPackageConfiguration(language: Language, config: BaseConfigurationItem): PackageConfiguration {
  switch (language) {
    case Language.CSHARP: {
      const {
        packageId,
        authors,
        description,
        title,
        packageTags,
        repositoryUrl,
        repositoryType,
        packageProjectUrl,
        packageIcon,
        packageReleaseNotes,
        copyright
      } = config as CSharpConfigurationItem;
      return {
        packageId,
        authors,
        description,
        title,
        packageTags,
        repositoryUrl,
        repositoryType,
        packageProjectUrl,
        packageIcon,
        packageReleaseNotes,
        copyright
      };
    }
    case Language.JAVA: {
      const { groupId, artifactId, name, description, url, developers, distributionManagement, scm } =
        config as JavaConfigurationItem;
      return { groupId, artifactId, name, description, url, developers, distributionManagement, scm };
    }
    case Language.PHP: {
      const { vendorName, projectName, description, type, keywords, homepage, authors, support } =
        config as PhpConfigurationItem;
      return { vendorName, projectName, description, type, keywords, homepage, authors, support };
    }
    case Language.PYTHON: {
      const { name, description, authors, maintainers, keywords, classifiers, urls } =
        config as PythonConfigurationItem;
      return { name, description, authors, maintainers, keywords, classifiers, urls };
    }
    case Language.RUBY: {
      const { name, authors, summary, description, email, homepage, metadata, postInstallMessage, requirements } =
        config as RubyConfigurationItem;
      return { name, authors, summary, description, email, homepage, metadata, postInstallMessage, requirements };
    }
    case Language.TYPESCRIPT: {
      const { name, author, description, contributors, bugs, keywords, homepage, repository } =
        config as TypeScriptConfigurationItem;
      return { name, author, description, contributors, bugs, keywords, homepage, repository };
    }
    case Language.GO:
      return {} as PackageConfiguration;
  }
}
