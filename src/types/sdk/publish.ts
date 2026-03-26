import { BaseConfigurationItem, LanguagePublishingConfig, PublishingProfileItem } from '../publish-api/publishing-profile.js';
import { Language } from './generate.js';

export enum PublishType {
  PackagePublishing = 'package',
  SourceCodePublishing = 'sourcecode'
}

export function getPublishTypeForLanguage({ packageConfig, gitConfig }: LanguagePublishingConfig): PublishType | undefined {
  const packageEnabled = packageConfig?.isEnabled === true;
  const gitEnabled = gitConfig?.isEnabled === true;
  if (packageEnabled && gitEnabled) return undefined;
  return packageEnabled ? PublishType.PackagePublishing : PublishType.SourceCodePublishing;
}

export function getPackageConfigurationForLanguage(
  language: Language,
  publishingProfile: PublishingProfileItem
): BaseConfigurationItem | null {
  switch (language) {
    case Language.CSHARP:
      return publishingProfile.cSharpConfiguration;
    case Language.JAVA:
      return publishingProfile.javaConfiguration;
    case Language.GO:
      return publishingProfile.goConfiguration;
    case Language.RUBY:
      return publishingProfile.rubyConfiguration;
    case Language.PHP:
      return publishingProfile.phpConfiguration;
    case Language.PYTHON:
      return publishingProfile.pythonConfiguration;
    case Language.TYPESCRIPT:
      return publishingProfile.typeScriptConfiguration;
  }
}
