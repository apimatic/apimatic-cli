import { Language } from '../sdk/generate.js';
import {
  CSharpConfigurationItem,
  GoConfigurationItem,
  JavaConfigurationItem,
  PhpConfigurationItem,
  PublishingProfileItem,
  PublishingProfileSummaryGroup,
  PublishingProfileWithLanguagesGroup,
  PythonConfigurationItem,
  RubyConfigurationItem,
  TypeScriptConfigurationItem,
  PublishType,
} from '../publish-api/publishing-profile-item.js';
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
} from './package-settings-configuration.js';

export class PublishingProfile {
  private readonly profile: PublishingProfileItem;
  private readonly languageConfigs: Partial<Record<Language, PackageConfigurationData>>;
  private readonly gitConfigs: Partial<Record<Language, GitConfiguration>>;

  private constructor(profile: PublishingProfileItem) {
    this.profile = profile;
    this.languageConfigs = Object.fromEntries(
      (
        [
          [Language.CSHARP, profile.cSharpConfiguration?.isEnabled ? PublishingProfile.createCSharpConfiguration(profile.cSharpConfiguration) : undefined],
          [Language.GO, profile.goConfiguration?.isEnabled ? PublishingProfile.createGoConfiguration(profile.goConfiguration) : undefined],
          [Language.JAVA, profile.javaConfiguration?.isEnabled ? PublishingProfile.createJavaConfiguration(profile.javaConfiguration) : undefined],
          [Language.PHP, profile.phpConfiguration?.isEnabled ? PublishingProfile.createPhpConfiguration(profile.phpConfiguration) : undefined],
          [Language.PYTHON, profile.pythonConfiguration?.isEnabled ? PublishingProfile.createPythonConfiguration(profile.pythonConfiguration) : undefined],
          [Language.RUBY, profile.rubyConfiguration?.isEnabled ? PublishingProfile.createRubyConfiguration(profile.rubyConfiguration) : undefined],
          [Language.TYPESCRIPT, profile.typeScriptConfiguration?.isEnabled ? PublishingProfile.createTypeScriptConfiguration(profile.typeScriptConfiguration) : undefined]
        ] as [Language, PackageConfigurationData | undefined][]
      ).filter(([, data]) => data !== undefined)
    );
    this.gitConfigs = Object.fromEntries(
      (
        [
          [Language.CSHARP, profile.cSharpGitConfiguration?.isEnabled ? profile.cSharpGitConfiguration : undefined],
          [Language.GO, profile.goGitConfiguration?.isEnabled ? profile.goGitConfiguration : undefined],
          [Language.JAVA, profile.javaGitConfiguration?.isEnabled ? profile.javaGitConfiguration : undefined],
          [Language.PHP, profile.phpGitConfiguration?.isEnabled ? profile.phpGitConfiguration : undefined],
          [Language.PYTHON, profile.pythonGitConfiguration?.isEnabled ? profile.pythonGitConfiguration : undefined],
          [Language.RUBY, profile.rubyGitConfiguration?.isEnabled ? profile.rubyGitConfiguration : undefined],
          [Language.TYPESCRIPT, profile.typeScriptGitConfiguration?.isEnabled ? profile.typeScriptGitConfiguration : undefined]
        ] as [Language, GitConfiguration | undefined][]
      ).filter(([, config]) => config !== undefined)
    );
  }

  public static create(item: PublishingProfileItem): PublishingProfile {
    return new PublishingProfile(item);
  }

  public toString(): string {
    return this.profile.name;
  }

  public hasEnabledLanguages(): boolean {
    return Object.keys(this.languageConfigs).length > 0 || Object.keys(this.gitConfigs).length > 0;
  }

  public isLanguageEnabled(language: Language): boolean {
    return language in this.languageConfigs || language in this.gitConfigs;
  }

  public getEnabledLanguages(): Language[] {
  return [...new Set([...Object.keys(this.languageConfigs), ...Object.keys(this.gitConfigs)])] as Language[];
}

  public getPublishTypesForLanguage(language: Language): PublishType[] {
    const types: PublishType[] = [];
    if (language in this.gitConfigs) types.push(PublishType.SourceCodePublishing);
    if (language in this.languageConfigs) types.push(PublishType.PackagePublishing);
    return types;
  }

  public getUnallowedPublishTypes(language: Language, requestedTypes: PublishType[]): PublishType[] {
    const allowedTypes = this.getPublishTypesForLanguage(language);
    return requestedTypes.filter((pt) => !allowedTypes.includes(pt));
  }

  public toPublishingProfileSummaryGroup(): PublishingProfileSummaryGroup {
    return {
      apiGroupName: this.profile.apiGroupName,
      profiles: [{ name: this.profile.name, id: this.profile.id, enabledLanguages: this.getEnabledLanguages() }]
    };
  }

  public toPublishingProfileWithLanguagesGroup(): PublishingProfileWithLanguagesGroup {
    return {
      apiGroupName: this.profile.apiGroupName,
      profiles: [
        {
          profile: this.profile,
          enabledLanguages: this.getEnabledLanguages()
        }
      ]
    };
  }

  public getPackageConfigurationDataForLanguage(language: Language): PackageConfigurationData | undefined {
    return this.languageConfigs[language];
  }

  private static createCSharpConfiguration(config: CSharpConfigurationItem): CSharpPackageConfiguration {
    return  {
          packageId: config.packageId,
          authors: config.authors,
          description: config.description,
          title: config.title,
          packageTags: config.packageTags,
          repositoryUrl: config.repositoryUrl,
          repositoryType: config.repositoryType,
          packageProjectUrl: config.packageProjectUrl,
          packageIcon: config.packageIcon,
          packageReleaseNotes: config.packageReleaseNotes,
          copyright: config.copyright
        };
  }

  private static createJavaConfiguration(config: JavaConfigurationItem): JavaPackageConfiguration {
    return {
          groupId: config.groupId,
          artifactId: config.artifactId,
          name: config.name,
          description: config.description,
          url: config.url,
          developers: config.developers,
          distributionManagement: config.distributionManagement,
          scm: config.scm
        };
  }

  private static createPhpConfiguration(config: PhpConfigurationItem): PhpPackageConfiguration {
    return {
          vendorName: config.vendorName,
          projectName: config.projectName,
          description: config.description,
          type: config.type,
          keywords: config.keywords,
          homepage: config.homepage,
          authors: config.authors,
          support: config.support
        };
  }

  private static createPythonConfiguration(config: PythonConfigurationItem): PythonPackageConfiguration {
    return {
          name: config.name,
          description: config.description,
          authors: config.authors,
          maintainers: config.maintainers,
          keywords: config.keywords,
          classifiers: config.classifiers,
          urls: Object.fromEntries(config.urls.map(({ key, value }) => [key, value]))
        };
  }

  private static createRubyConfiguration(config: RubyConfigurationItem) : RubyPackageConfiguration {
    return  {
          name: config.name,
          authors: config.authors,
          summary: config.summary,
          description: config.description,
          email: config.email,
          homepage: config.homepage,
          metadata: Object.fromEntries(config.metadata.map(({ key, value }) => [key, value])),
          postInstallMessage: config.postInstallMessage,
          requirements: config.requirements
        };
  }

  private static createTypeScriptConfiguration(config: TypeScriptConfigurationItem): TypeScriptPackageConfiguration {
    return  {
          name: config.name,
          author: config.author,
          description: config.description,
          contributors: config.contributors,
          bugs: config.bugs,
          homepage: config.homepage,
          keywords: config.keywords,
          repository: config.repository,
        };
  }

  private static createGoConfiguration(config: GoConfigurationItem): GoPackageConfiguration {
    return {
          packageName: config.packageName
        };
  }
}
