import { PluginRecordSdkPrompts } from '../../prompts/plugin/record-sdk.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { buildLanguageEntry } from '../../types/plugin/language-entry.js';
import { PluginConfigContext } from '../../types/plugin-config-context.js';
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
    codegenVersion: CodeGenerationVersion,
    confirmFirst: boolean = true
  ): Promise<void> => {
    const built = buildLanguageEntry(
      language,
      publishingProfile.getGitConfigurationForLanguage(language),
      publishingProfile.getPackageConfigurationDataForLanguage(language),
      codegenVersion
    );
    // A package-only profile names no repository, and a language cannot be described without one,
    // so there is nothing to offer. This returns before the confirm below, so without a message
    // the prompt would simply never appear.
    if (built.kind !== 'entry') {
      this.prompts.noSourceRepository(language);
      return;
    }

    const pluginConfigContext = new PluginConfigContext(buildDirectory);
    const configState = await pluginConfigContext.validate();
    if (configState.state === 'unreadable') {
      this.prompts.pluginConfigUnreadable();
      return;
    }

    // A non-interactive run has already decided via `--update-plugin-config`; there is nobody to ask.
    if (confirmFirst && !(await this.prompts.confirmRecordSdk(language, configState.state !== 'missing'))) {
      return;
    }

    // The state was readable a moment ago, so this only fails if the file changed underneath us.
    if (await pluginConfigContext.upsertLanguage(language, built.entry)) {
      this.prompts.sdkRecorded(language);
    } else {
      this.prompts.pluginConfigUnreadable();
    }
  };
}
