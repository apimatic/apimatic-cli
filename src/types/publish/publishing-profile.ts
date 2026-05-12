import { Language } from '../sdk/generate.js';
import {
  CSharpConfigurationItem,
  GitConfigurationItem,
  GoConfigurationItem,
  JavaConfigurationItem,
  LanguagePublishingConfig,
  PhpConfigurationItem,
  PublishingProfileItem,
  PublishingProfileSummaryGroup,
  PublishingProfileWithLanguagesGroup,
  PublishType,
  PythonConfigurationItem,
  RubyConfigurationItem,
  TypeScriptConfigurationItem
} from '../publish-api/publishing-profile-item.js';
import { PackageConfigurationData } from './package-settings-configuration.js';

export class PublishingProfile {
  private readonly id: string;
  private readonly name: string;
  private readonly apiGroupId: string;
  private readonly apiGroupName: string;
  private readonly cSharpConfiguration: CSharpConfigurationItem | null;
  private readonly goConfiguration: GoConfigurationItem | null;
  private readonly javaConfiguration: JavaConfigurationItem | null;
  private readonly phpConfiguration: PhpConfigurationItem | null;
  private readonly pythonConfiguration: PythonConfigurationItem | null;
  private readonly rubyConfiguration: RubyConfigurationItem | null;
  private readonly typeScriptConfiguration: TypeScriptConfigurationItem | null;
  private readonly cSharpGitConfiguration: GitConfigurationItem | null;
  private readonly goGitConfiguration: GitConfigurationItem | null;
  private readonly javaGitConfiguration: GitConfigurationItem | null;
  private readonly phpGitConfiguration: GitConfigurationItem | null;
  private readonly pythonGitConfiguration: GitConfigurationItem | null;
  private readonly rubyGitConfiguration: GitConfigurationItem | null;
  private readonly typeScriptGitConfiguration: GitConfigurationItem | null;

  private constructor(item: PublishingProfileItem) {
    this.id = item.id;
    this.name = item.name;
    this.apiGroupId = item.apiGroupId;
    this.apiGroupName = item.apiGroupName;
    this.cSharpConfiguration = item.cSharpConfiguration;
    this.goConfiguration = item.goConfiguration;
    this.javaConfiguration = item.javaConfiguration;
    this.phpConfiguration = item.phpConfiguration;
    this.pythonConfiguration = item.pythonConfiguration;
    this.rubyConfiguration = item.rubyConfiguration;
    this.typeScriptConfiguration = item.typeScriptConfiguration;
    this.cSharpGitConfiguration = item.cSharpGitConfiguration;
    this.goGitConfiguration = item.goGitConfiguration;
    this.javaGitConfiguration = item.javaGitConfiguration;
    this.phpGitConfiguration = item.phpGitConfiguration;
    this.pythonGitConfiguration = item.pythonGitConfiguration;
    this.rubyGitConfiguration = item.rubyGitConfiguration;
    this.typeScriptGitConfiguration = item.typeScriptGitConfiguration;
  }

  public static create(item: PublishingProfileItem): PublishingProfile {
    return new PublishingProfile(item);
  }

  public toString(): string {
    return this.name;
  }

  public hasEnabledLanguages(): boolean {
    const languageConfigs = this.getLanguageConfigs();
    return languageConfigs.some(({ packageConfig, gitConfig }) => packageConfig?.isEnabled || gitConfig?.isEnabled);
  }

  public isLanguageEnabled(language: Language): boolean {
    const { packageConfig, gitConfig } = this.getLanguageConfig(language);
    return packageConfig?.isEnabled === true || gitConfig?.isEnabled === true;
  }

  public getEnabledLanguages(): Language[] {
    const languageConfigs = this.getLanguageConfigs();
    return languageConfigs
      .filter(({ packageConfig, gitConfig }) => packageConfig?.isEnabled || gitConfig?.isEnabled)
      .map(({ language }) => language);
  }

  public getPublishTypesForLanguage(language: Language): PublishType[] {
    const { packageConfig, gitConfig } = this.getLanguageConfig(language);
    const types: PublishType[] = [];
    if (gitConfig?.isEnabled === true) types.push(PublishType.SourceCodePublishing);
    if (packageConfig?.isEnabled === true) types.push(PublishType.PackagePublishing);
    return types;
  }

  public getUnallowedPublishTypes(language: Language, requestedTypes: PublishType[]): PublishType[] {
    const allowedTypes = this.getPublishTypesForLanguage(language);
    return requestedTypes.filter((pt) => !allowedTypes.includes(pt));
  }

  public toPublishingProfileSummaryGroup(): PublishingProfileSummaryGroup {
    return {
      apiGroupName: this.apiGroupName,
      profiles: [{ name: this.name, id: this.id, enabledLanguages: this.getEnabledLanguages() }]
    };
  }

  public toPublishingProfileWithLanguagesGroup(): PublishingProfileWithLanguagesGroup {
    return {
      apiGroupName: this.apiGroupName,
      profiles: [
        {
          profile: {
            id: this.id,
            name: this.name,
            apiGroupId: this.apiGroupId,
            apiGroupName: this.apiGroupName,
            cSharpConfiguration: this.cSharpConfiguration,
            goConfiguration: this.goConfiguration,
            javaConfiguration: this.javaConfiguration,
            phpConfiguration: this.phpConfiguration,
            pythonConfiguration: this.pythonConfiguration,
            rubyConfiguration: this.rubyConfiguration,
            typeScriptConfiguration: this.typeScriptConfiguration,
            cSharpGitConfiguration: this.cSharpGitConfiguration,
            goGitConfiguration: this.goGitConfiguration,
            javaGitConfiguration: this.javaGitConfiguration,
            phpGitConfiguration: this.phpGitConfiguration,
            pythonGitConfiguration: this.pythonGitConfiguration,
            rubyGitConfiguration: this.rubyGitConfiguration,
            typeScriptGitConfiguration: this.typeScriptGitConfiguration
          },
          enabledLanguages: this.getEnabledLanguages()
        }
      ]
    };
  }

  public getPackageConfigurationDataForLanguage(language: Language): PackageConfigurationData | undefined {
    switch (language) {
      case Language.CSHARP:
        return this.cSharpConfiguration && this.cSharpConfiguration.isEnabled
        ? {
            packageId: this.cSharpConfiguration.packageId,
            authors: this.cSharpConfiguration.authors,
            description: this.cSharpConfiguration.description,
            title: this.cSharpConfiguration.title,
            packageTags: this.cSharpConfiguration.packageTags,
            repositoryUrl: this.cSharpConfiguration.repositoryUrl,
            repositoryType: this.cSharpConfiguration.repositoryType,
            packageProjectUrl: this.cSharpConfiguration.packageProjectUrl,
            packageIcon: this.cSharpConfiguration.packageIcon,
            packageReleaseNotes: this.cSharpConfiguration.packageReleaseNotes,
            copyright: this.cSharpConfiguration.copyright
        }
        : undefined;
      case Language.JAVA:
        return this.javaConfiguration && this.javaConfiguration.isEnabled
        ? {
            groupId: this.javaConfiguration.groupId,
            artifactId: this.javaConfiguration.artifactId,
            name: this.javaConfiguration.name,
            description: this.javaConfiguration.description,
            url: this.javaConfiguration.url,
            developers: this.javaConfiguration.developers,
            distributionManagement: this.javaConfiguration.distributionManagement,
            scm: this.javaConfiguration.scm
          }
        : undefined;
      case Language.PHP:
        return this.phpConfiguration && this.phpConfiguration.isEnabled
        ? {
            vendorName: this.phpConfiguration.vendorName,
            projectName: this.phpConfiguration.projectName,
            description: this.phpConfiguration.description,
            type: this.phpConfiguration.type,
            keywords: this.phpConfiguration.keywords,
            homepage: this.phpConfiguration.homepage,
            authors: this.phpConfiguration.authors,
            support: this.phpConfiguration.support
         }
        : undefined;
      case Language.PYTHON:
        return this.pythonConfiguration && this.pythonConfiguration.isEnabled
        ? {
            name: this.pythonConfiguration.name,
            description: this.pythonConfiguration.description,
            authors: this.pythonConfiguration.authors,
            maintainers: this.pythonConfiguration.maintainers,
            keywords: this.pythonConfiguration.keywords,
            classifiers: this.pythonConfiguration.classifiers,
            urls: Object.fromEntries(this.pythonConfiguration.urls.map(({ key, value }) => [key, value]))
        }
        : undefined;
      case Language.RUBY:
        return this.rubyConfiguration && this.rubyConfiguration.isEnabled
        ? {
            name: this.rubyConfiguration.name,
            authors: this.rubyConfiguration.authors,
            summary: this.rubyConfiguration.summary,
            description: this.rubyConfiguration.description,
            email: this.rubyConfiguration.email,
            homepage: this.rubyConfiguration.homepage,
            metadata: Object.fromEntries(this.rubyConfiguration.metadata.map(({ key, value }) => [key, value])),
            postInstallMessage: this.rubyConfiguration.postInstallMessage,
            requirements: this.rubyConfiguration.requirements
        }
        : undefined;
      case Language.TYPESCRIPT:
        return this.typeScriptConfiguration && this.typeScriptConfiguration.isEnabled
        ? {
            name: this.typeScriptConfiguration.name,
            author: this.typeScriptConfiguration.author,
            description: this.typeScriptConfiguration.description,
            contributors: this.typeScriptConfiguration.contributors,
            bugs: this.typeScriptConfiguration.bugs,
            homepage: this.typeScriptConfiguration.homepage,
            repository: this.typeScriptConfiguration.repository,
            keywords: this.typeScriptConfiguration.keywords
        }
        : undefined;
      case Language.GO:
        return this.goConfiguration && this.goConfiguration.isEnabled
        ? {
            packageName: this.goConfiguration.packageName
        }
        : undefined;
    }
  }

  private getLanguageConfigs(): LanguagePublishingConfig[] {
    return [
      { language: Language.CSHARP, packageConfig: this.cSharpConfiguration, gitConfig: this.cSharpGitConfiguration },
      { language: Language.JAVA, packageConfig: this.javaConfiguration, gitConfig: this.javaGitConfiguration },
      { language: Language.GO, packageConfig: this.goConfiguration, gitConfig: this.goGitConfiguration },
      { language: Language.PHP, packageConfig: this.phpConfiguration, gitConfig: this.phpGitConfiguration },
      { language: Language.PYTHON, packageConfig: this.pythonConfiguration, gitConfig: this.pythonGitConfiguration },
      { language: Language.RUBY, packageConfig: this.rubyConfiguration, gitConfig: this.rubyGitConfiguration },
      {
        language: Language.TYPESCRIPT,
        packageConfig: this.typeScriptConfiguration,
        gitConfig: this.typeScriptGitConfiguration
      }
    ];
  }

  private getLanguageConfig(language: Language): LanguagePublishingConfig {
    return this.getLanguageConfigs().find((lc) => lc.language === language)!;
  }
}
