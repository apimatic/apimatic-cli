import { PluginRecordSdkPrompts } from '../../prompts/plugin/record-sdk.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { buildLanguageEntry } from '../../types/plugin/language-entry.js';
import { PluginConfigContext } from '../../types/plugin-config-context.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';
import { SemVersion } from '../../types/publish/version.js';
import { Language } from '../../types/sdk/generate.js';
import { ActionResult } from '../action-result.js';

/**
 * Callers discard the result: this runs after a publish that already succeeded, and no outcome here
 * may change that.
 */
export class PluginRecordSdkAction {
  private readonly prompts: PluginRecordSdkPrompts = new PluginRecordSdkPrompts();

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    language: Language,
    publishingProfile: PublishingProfile,
    publishTypes: PublishType[],
    packageVersion: SemVersion
  ): Promise<ActionResult> => {
    // The entry describes what this run published, not what the profile enables: a package-only
    // run claims no repository, and a source-only run records no released version. The package
    // configuration is written either way — it says how the package is set up, not that one
    // exists, and the service reads the package's name out of it.
    const entry = buildLanguageEntry(
      language,
      publishTypes.includes(PublishType.SourceCodePublishing)
        ? publishingProfile.getGitConfigurationForLanguage(language)
        : undefined,
      publishingProfile.getPackageConfigurationDataForLanguage(language),
      publishTypes.includes(PublishType.PackagePublishing) ? packageVersion : undefined
    );

    const pluginConfigContext = new PluginConfigContext(buildDirectory);
    const configState = await pluginConfigContext.getPluginConfigState();
    if (configState.state === 'unreadable') {
      this.prompts.pluginConfigUnreadable(configState.reason);
      return ActionResult.failed();
    }

    const configExisted = configState.state === 'present';

    if (!entry.publishing?.source && (!configExisted || configState.hasNoSourceRepository(language))) {
      this.prompts.noSourceRepository(language);
    }

    const writeResult = await pluginConfigContext.upsertLanguage(language, entry);
    if (writeResult.isErr()) {
      switch (writeResult.error) {
        // Readable a moment ago, so this only happens if the file changed underneath us.
        case 'unreadable':
          this.prompts.pluginConfigUnreadable();
          return ActionResult.failed();
        case 'unwritable':
          this.prompts.pluginConfigNotWritten();
          return ActionResult.failed();
        default:
          throw writeResult.error satisfies never;
      }
    }

    this.prompts.sdkRecorded(language, configExisted);
    return ActionResult.success();
  };
}
