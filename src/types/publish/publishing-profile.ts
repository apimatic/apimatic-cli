import { Language } from '../sdk/generate.js';
import {
  CSharpConfigurationItem,
  GitConfigurationItem,
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
  private readonly gitConfigs: Partial<Record<Language, GitConfigurationItem>>;

  private constructor(profile: PublishingProfileItem) {
    this.profile = profile;
    this.languageConfigs = Object.fromEntries(
      (
        [
          [Language.CSHARP, PublishingProfile.createCSharpConfiguration(profile.cSharpConfiguration)],
          [Language.GO, PublishingProfile.createGoConfiguration(profile.goConfiguration)],
          [Language.JAVA, PublishingProfile.createJavaConfiguration(profile.javaConfiguration)],
          [Language.PHP, PublishingProfile.createPhpConfiguration(profile.phpConfiguration)],
          [Language.PYTHON, PublishingProfile.createPythonConfiguration(profile.pythonConfiguration)],
          [Language.RUBY, PublishingProfile.createRubyConfiguration(profile.rubyConfiguration)],
          [Language.TYPESCRIPT, PublishingProfile.createTypeScriptConfiguration(profile.typeScriptConfiguration)]
        ] as [Language, PackageConfigurationData | undefined][]
      ).filter(([, data]) => data !== undefined)
    );
    this.gitConfigs = Object.fromEntries(
      (
        [
          [Language.CSHARP, profile.cSharpGitConfiguration],
          [Language.GO, profile.goGitConfiguration],
          [Language.JAVA, profile.javaGitConfiguration],
          [Language.PHP, profile.phpGitConfiguration],
          [Language.PYTHON, profile.pythonGitConfiguration],
          [Language.RUBY, profile.rubyGitConfiguration],
          [Language.TYPESCRIPT, profile.typeScriptGitConfiguration]
        ] as [Language, GitConfigurationItem | null][]
      ).filter(([, config]) => config?.isEnabled)
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

  private static createCSharpConfiguration(config: CSharpConfigurationItem | null): CSharpPackageConfiguration | undefined {
    return config?.isEnabled
      ? {
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
        }
      : undefined;
  }

  private static createJavaConfiguration(config: JavaConfigurationItem | null): JavaPackageConfiguration | undefined {
    return config?.isEnabled
      ? {
          groupId: config.groupId,
          artifactId: config.artifactId,
          name: config.name,
          description: config.description,
          url: config.url,
          developers: config.developers,
          distributionManagement: config.distributionManagement,
          scm: config.scm
        }
      : undefined;
  }

  private static createPhpConfiguration(config: PhpConfigurationItem | null): PhpPackageConfiguration | undefined {
    return config?.isEnabled
      ? {
          vendorName: config.vendorName,
          projectName: config.projectName,
          description: config.description,
          type: config.type,
          keywords: config.keywords,
          homepage: config.homepage,
          authors: config.authors,
          support: config.support
        }
      : undefined;
  }

  private static createPythonConfiguration(config: PythonConfigurationItem | null): PythonPackageConfiguration | undefined {
    return config?.isEnabled
      ? {
          name: config.name,
          description: config.description,
          authors: config.authors,
          maintainers: config.maintainers,
          keywords: config.keywords,
          classifiers: config.classifiers,
          urls: Object.fromEntries(config.urls.map(({ key, value }) => [key, value]))
        }
      : undefined;
  }

  private static createRubyConfiguration(config: RubyConfigurationItem | null): RubyPackageConfiguration | undefined {
    return config?.isEnabled
      ? {
          name: config.name,
          authors: config.authors,
          summary: config.summary,
          description: config.description,
          email: config.email,
          homepage: config.homepage,
          metadata: Object.fromEntries(config.metadata.map(({ key, value }) => [key, value])),
          postInstallMessage: config.postInstallMessage,
          requirements: config.requirements
        }
      : undefined;
  }

  private static createTypeScriptConfiguration(config: TypeScriptConfigurationItem | null): TypeScriptPackageConfiguration | undefined {
    return config?.isEnabled
      ? {
          name: config.name,
          author: config.author,
          description: config.description,
          contributors: config.contributors,
          bugs: config.bugs,
          homepage: config.homepage,
          keywords: config.keywords,
          repository: config.repository,
        }
      : undefined;
  }

  private static createGoConfiguration(config: GoConfigurationItem | null): GoPackageConfiguration | undefined {
    return config?.isEnabled
      ? {
          packageName: config.packageName
        }
      : undefined;
  }

}
