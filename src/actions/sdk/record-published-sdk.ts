import { RecordPublishedSdkPrompts } from '../../prompts/sdk/record-published-sdk.js';
import { ConfigBlockName, findingClause } from '../../types/apimatic-config/document.js';
import { buildLanguageEntry, languagesOf, withLanguage } from '../../types/apimatic-config/languages-block.js';
import { ProjectContext } from '../../types/project-context.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';
import { SemVersion } from '../../types/publish/version.js';
import { Language } from '../../types/sdk/generate.js';
import { ActionResult } from '../action-result.js';

/** A publish writes where its SDK went, and nothing else in the file is its business. */
const RECORDED_BLOCKS: readonly ConfigBlockName[] = ['languages'];

/**
 * Callers discard the result: this runs after a publish that already succeeded, and no outcome here
 * may change that.
 */
export class RecordPublishedSdkAction {
  private readonly prompts: RecordPublishedSdkPrompts = new RecordPublishedSdkPrompts();

  public readonly execute = async (
    project: ProjectContext,
    language: Language,
    publishingProfile: PublishingProfile,
    publishTypes: PublishType[],
    packageVersion: SemVersion
  ): Promise<ActionResult> => {
    // A package-only run claims no repository, and a source-only run records no released version.
    // The configuration is written either way: it says how the package is set up, not that one is.
    const entry = buildLanguageEntry(
      language,
      publishTypes.includes(PublishType.SourceCodePublishing)
        ? publishingProfile.getGitConfigurationForLanguage(language)
        : undefined,
      publishingProfile.getPackageConfigurationDataForLanguage(language),
      publishTypes.includes(PublishType.PackagePublishing) ? packageVersion : undefined
    );

    const config = project.config();
    const state = await config.read();
    if (state.state === 'unparseable') {
      this.prompts.configUnreadable(findingClause(state.findings));
      return ActionResult.failed();
    }

    const configExisted = state.state === 'parsed';
    if (configExisted) {
      const findings = state.document.findingsFor('root', ...RECORDED_BLOCKS);
      if (findings.length > 0) {
        this.prompts.configUnreadable(findingClause(findings));
        return ActionResult.failed();
      }
    }

    const recorded = configExisted ? languagesOf(state.document)[language] : undefined;
    if (!entry.publishing?.source && !recorded?.publishing?.source) {
      this.prompts.noSourceRepository(language);
    }

    const written = await config.merge(RECORDED_BLOCKS, (document) =>
      document.with('languages', withLanguage(languagesOf(document), language, entry))
    );
    if (written.isErr()) {
      switch (written.error) {
        // Readable a moment ago, so this only happens if the file changed underneath us.
        case 'unreadable':
          this.prompts.configUnreadable();
          return ActionResult.failed();
        case 'unwritable':
          this.prompts.configNotWritten();
          return ActionResult.failed();
        default:
          throw written.error satisfies never;
      }
    }

    this.prompts.sdkRecorded(language, configExisted);
    return ActionResult.success();
  };
}
