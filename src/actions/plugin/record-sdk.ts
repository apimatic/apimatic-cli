import { PluginRecordSdkPrompts } from '../../prompts/plugin/record-sdk.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { buildLanguageEntry } from '../../types/plugin/language-entry.js';
import { PluginConfigContext } from '../../types/plugin-config-context.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';
import { CodeGenerationVersion, Language } from '../../types/sdk/generate.js';

/**
 * Records a freshly published SDK in `plugin-config.json`. Returns nothing and never throws: this
 * runs after a successful publish, and no outcome here may change that result.
 *
 * Interactive runs are asked first, which is what keeps the file from appearing for users who do
 * not want a context plugin. Non-interactive runs answer with `--update-plugin-config` instead,
 * because a prompt on the CI path would never be answered.
 *
 * Metadata is deliberately not written — `plugin generate` owns that, so publishing never has to
 * ask for a plugin id or reach the account API.
 */
export class PluginRecordSdkAction {
  private readonly prompts: PluginRecordSdkPrompts = new PluginRecordSdkPrompts();

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    language: Language,
    publishingProfile: PublishingProfile,
    publishTypes: PublishType[],
    codegenVersion: CodeGenerationVersion,
    confirmFirst: boolean = true
  ): Promise<void> => {
    // The entry has to describe what this run published, not what the profile happens to enable.
    // A package-only run must not claim a repository it never pushed to, nor a source-only run a
    // package that was never released.
    const entry = buildLanguageEntry(
      language,
      publishTypes.includes(PublishType.SourceCodePublishing)
        ? publishingProfile.getGitConfigurationForLanguage(language)
        : undefined,
      publishTypes.includes(PublishType.PackagePublishing)
        ? publishingProfile.getPackageConfigurationDataForLanguage(language)
        : undefined,
      codegenVersion
    );

    if (!entry.source) {
      this.prompts.noSourceRepository(language);
    }

    const pluginConfigContext = new PluginConfigContext(buildDirectory);
    const configState = await pluginConfigContext.loadState();
    if (configState.state === 'unreadable') {
      this.prompts.pluginConfigUnreadable();
      return;
    }

    // A non-interactive run has already decided via `--update-plugin-config`; there is nobody to ask.
    if (confirmFirst && !(await this.prompts.confirmRecordSdk(language, configState.state === 'present'))) {
      return;
    }

    switch (await pluginConfigContext.upsertLanguage(language, entry)) {
      case 'written':
        this.prompts.sdkRecorded(language);
        break;
      // Readable a moment ago, so this only happens if the file changed underneath us.
      case 'unreadable':
        this.prompts.pluginConfigUnreadable();
        break;
      case 'unwritable':
        this.prompts.pluginConfigNotWritten();
        break;
    }
  };
}
