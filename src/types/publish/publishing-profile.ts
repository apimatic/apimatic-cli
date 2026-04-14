import { Language } from '../sdk/generate.js';
import {
  BaseConfigurationItem,
  LanguagePublishingConfig,
  PublishingProfileItem,
  PublishingProfileSummaryGroup,
  PublishingProfileWithLanguagesGroup,
  PublishType
} from '../publish-api/publishing-profile-item.js';

export class PublishingProfile {
  private readonly item: PublishingProfileItem;

  private constructor(item: PublishingProfileItem) {
    this.item = item;
  }

  public static create(item: PublishingProfileItem): PublishingProfile {
    return new PublishingProfile(item);
  }

  public toString(): string {
    return this.item.name;
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
    if (packageConfig?.isEnabled === true) types.push(PublishType.PackagePublishing);
    if (gitConfig?.isEnabled === true) types.push(PublishType.SourceCodePublishing);
    return types;
  }

  public getUnallowedPublishTypes(language: Language, requestedTypes: PublishType[]): PublishType[] {
    const allowedTypes = this.getPublishTypesForLanguage(language);
    return requestedTypes.filter((pt) => !allowedTypes.includes(pt));
  }

  public toPublishingProfileSummaryGroup(): PublishingProfileSummaryGroup {
    return {
      apiGroupName: this.item.apiGroupName,
      profiles: [{ name: this.item.name, id: this.item.id, enabledLanguages: this.getEnabledLanguages() }]
    };
  }

  public toPublishingProfileWithLanguagesGroup(): PublishingProfileWithLanguagesGroup {
    return {
      apiGroupName: this.item.apiGroupName,
      profiles: [{ profile: this.item, enabledLanguages: this.getEnabledLanguages() }]
    };
  }

  public getPackageConfigurationForLanguage(language: Language): BaseConfigurationItem | null {
    switch (language) {
      case Language.CSHARP:
        return this.item.cSharpConfiguration;
      case Language.JAVA:
        return this.item.javaConfiguration;
      case Language.GO:
        return this.item.goConfiguration;
      case Language.RUBY:
        return this.item.rubyConfiguration;
      case Language.PHP:
        return this.item.phpConfiguration;
      case Language.PYTHON:
        return this.item.pythonConfiguration;
      case Language.TYPESCRIPT:
        return this.item.typeScriptConfiguration;
    }
  }

  private getLanguageConfigs(): LanguagePublishingConfig[] {
    return [
      {
        language: Language.CSHARP,
        packageConfig: this.item.cSharpConfiguration,
        gitConfig: this.item.cSharpGitConfiguration
      },
      {
        language: Language.JAVA,
        packageConfig: this.item.javaConfiguration,
        gitConfig: this.item.javaGitConfiguration
      },
      { language: Language.GO, packageConfig: this.item.goConfiguration, gitConfig: this.item.goGitConfiguration },
      { language: Language.PHP, packageConfig: this.item.phpConfiguration, gitConfig: this.item.phpGitConfiguration },
      {
        language: Language.PYTHON,
        packageConfig: this.item.pythonConfiguration,
        gitConfig: this.item.pythonGitConfiguration
      },
      {
        language: Language.RUBY,
        packageConfig: this.item.rubyConfiguration,
        gitConfig: this.item.rubyGitConfiguration
      },
      {
        language: Language.TYPESCRIPT,
        packageConfig: this.item.typeScriptConfiguration,
        gitConfig: this.item.typeScriptGitConfiguration
      }
    ];
  }

  private getLanguageConfig(language: Language): LanguagePublishingConfig {
    return this.getLanguageConfigs().find((lc) => lc.language === language)!;
  }
}
