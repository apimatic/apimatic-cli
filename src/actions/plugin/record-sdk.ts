import { PluginRecordSdkPrompts } from '../../prompts/plugin/record-sdk.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { buildLanguageEntry } from '../../types/plugin/language-entry.js';
import { PluginConfigContext } from '../../types/plugin-config-context.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';
import { SemVersion } from '../../types/publish/version.js';
import { CodeGenerationVersion, Language } from '../../types/sdk/generate.js';
import { ActionResult } from '../action-result.js';

/**
 * Records a freshly published SDK in `plugin-config.json`. Callers discard the result: this runs
 * after a publish that already succeeded, and no outcome here may change that.
 */
export class PluginRecordSdkAction {
  private readonly prompts: PluginRecordSdkPrompts = new PluginRecordSdkPrompts();

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    language: Language,
    publishingProfile: PublishingProfile,
    publishTypes: PublishType[],
    packageVersion: SemVersion,
    codegenVersion: CodeGenerationVersion,
    confirmFirst: boolean
  ): Promise<ActionResult> => {
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
      packageVersion,
      codegenVersion
    );

    if (!entry.source) {
      this.prompts.noSourceRepository(language);
    }

    const pluginConfigContext = new PluginConfigContext(buildDirectory);
    const configState = await pluginConfigContext.loadState();
    if (configState.state === 'unreadable') {
      this.prompts.pluginConfigUnreadable();
      return ActionResult.failed();
    }

    if (configState.state === 'present') {
      const result = configState.assertNoCodegenVersionMismatch(codegenVersion, language, entry);
      if (result.isErr()) {
        this.prompts.codegenVersionMismatch(language, result.error.actual, result.error.expected);
      }
    }

    // A non-interactive run has already decided via `--update-plugin-config`; there is nobody to ask.
    if (confirmFirst && !(await this.prompts.confirmRecordSdk(language, configState.state === 'present'))) {
      return ActionResult.cancelled();
    }

    const result = await pluginConfigContext.upsertLanguage(language, entry);

    switch (result) {
      // Readable a moment ago, so this only happens if the file changed underneath us.
      case 'unreadable':
        this.prompts.pluginConfigUnreadable();
        return ActionResult.failed();
      case 'unwritable':
        this.prompts.pluginConfigNotWritten();
        return ActionResult.failed();
      case 'written':
        this.prompts.sdkRecorded(language);
        return ActionResult.success();
      default:
        throw result satisfies never;
    }
  };
}
