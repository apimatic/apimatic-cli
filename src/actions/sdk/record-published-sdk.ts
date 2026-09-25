import { RecordPublishedSdkPrompts } from '../../prompts/sdk/record-published-sdk.js';
import { ApimaticConfigContext } from '../../types/apimatic-config-context.js';
import { ApimaticConfigDocument, ConfigBlockName, findingClause } from '../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { buildLanguageEntry } from '../../types/plugin/language-entry.js';
import { PluginLanguageEntry, PluginLanguages } from '../../types/plugin/plugin-config.js';
import { PublishType } from '../../types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../types/publish/publishing-profile.js';
import { SemVersion } from '../../types/publish/version.js';
import { Language } from '../../types/sdk/generate.js';
import { ActionResult } from '../action-result.js';

/** A publish writes where its SDK went, and nothing else in the file is its business. */
const RECORDED_BLOCKS: readonly ConfigBlockName[] = ['languages'];

const languagesOf = (document: ApimaticConfigDocument): PluginLanguages =>
  (document.languages() ?? {}) as PluginLanguages;

/**
 * What a run published is added to what the entry already holds: a package-only run leaves the
 * repository a previous source publish recorded, and the other way about.
 */
function withLanguage<L extends Language>(
  languages: PluginLanguages,
  language: L,
  entry: PluginLanguageEntry<L>
): PluginLanguages {
  const existingEntry = languages[language];
  const existingPublishing = existingEntry?.publishing;
  const publishing = entry.publishing
    ? {
        ...existingPublishing,
        ...entry.publishing,
        source: entry.publishing.source ?? existingPublishing?.source,
        package: entry.publishing.package ?? existingPublishing?.package
      }
    : existingPublishing;

  return { ...languages, [language]: { ...existingEntry, ...entry, ...(publishing ? { publishing } : {}) } };
}

/**
 * Callers discard the result: this runs after a publish that already succeeded, and no outcome here
 * may change that.
 */
export class RecordPublishedSdkAction {
  private readonly prompts: RecordPublishedSdkPrompts = new RecordPublishedSdkPrompts();

  public readonly execute = async (
    sourceDirectory: DirectoryPath,
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

    const config = new ApimaticConfigContext(sourceDirectory);
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
