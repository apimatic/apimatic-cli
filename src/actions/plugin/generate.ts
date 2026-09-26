import { ResultAsync } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PluginService } from '../../infrastructure/services/plugin-service.js';
import { PublishingApiService } from '../../infrastructure/services/publishing-api-service.js';
import { PluginGeneratePrompts } from '../../prompts/plugin/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PluginConfigWriteFailure, unattendedLanguages } from '../../types/plugin-config-context.js';
import { PluginContext } from '../../types/plugin-context.js';
import { ProjectContext } from '../../types/project-context.js';
import { PublishingProfiles } from '../../types/publish/publishing-profiles.js';
import { TempContext } from '../../types/temp-context.js';
import { ActionResult } from '../action-result.js';
import { PluginRecordMetadataAction } from './record-metadata.js';

export class PluginGenerateAction {
  private readonly prompts: PluginGeneratePrompts = new PluginGeneratePrompts();
  private readonly pluginService: PluginService = new PluginService();
  private readonly publishingApiService: PublishingApiService = new PublishingApiService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    project: ProjectContext,
    pluginDirectory: DirectoryPath,
    force: boolean
  ): Promise<ActionResult> => {
    const sourceDirectory = project.sourceDirectory();
    if (project.isSourceDirectory(pluginDirectory)) {
      this.prompts.directoryCannotBeSame(pluginDirectory);
      return ActionResult.failed();
    }

    if (!(await project.sourceExists())) {
      this.prompts.sourceDirectoryDoesNotExist(sourceDirectory);
      return ActionResult.failed();
    }

    const pluginContext = new PluginContext(pluginDirectory);
    if (!force && (await pluginContext.exists()) && !(await this.prompts.overwritePlugin(pluginDirectory))) {
      this.prompts.pluginDirectoryNotEmpty();
      return ActionResult.cancelled();
    }

    const configContext = project.pluginConfig();
    const configState = await configContext.getPluginConfigState();
    if (configState.state === 'unreadable') {
      this.prompts.pluginConfigUnreadable(configState.reason, configState.path);
      return ActionResult.failed();
    }

    const recorded = unattendedLanguages(configState);
    if (recorded.length === 0 && !this.prompts.canAsk()) {
      this.prompts.setupNeedsTerminal(sourceDirectory);
      return ActionResult.failed();
    }

    const recordMetadata = new PluginRecordMetadataAction(this.configDir, this.commandMetadata, this.authKey);
    const identified = await recordMetadata.execute(project, configState);
    if (!identified.isSuccess()) {
      return identified.discardValue();
    }

    const config = identified.getValue();
    const selection = recorded.length > 0 ? recorded : await this.prompts.selectLanguages(config);
    if (!selection?.length) {
      this.prompts.noLanguagesSelected();
      return ActionResult.cancelled();
    }
    this.prompts.recordedLanguagesIncluded(recorded);

    this.prompts.languagesNotIncluded(config.unsupportedLanguages());

    // Asked before the config is written, so a declined run leaves no language claimed in it.
    const couldPublishInstead =
      selection.some((language) => !config.publishedLanguages().includes(language)) &&
      (
        await this.prompts.checkPublishingProfiles(
          this.publishingApiService.getPublishingProfiles(this.configDir, this.commandMetadata.shell, this.authKey)
        )
      )
        .andThen(PublishingProfiles.create)
        .map((profiles) => profiles.getActiveProfiles().length > 0)
        .unwrapOr(false);
    if (couldPublishInstead && !(await this.prompts.confirmLocalPlugin(recorded.length > 0))) {
      this.prompts.localPluginCancelled();
      return ActionResult.cancelled();
    }

    const generated = await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const written = await configContext.recordLanguages(selection);
      return await written
        .asyncAndThen(() => new ResultAsync(configContext.stageUpload(tempDirectory, selection)))
        .map((staged) => tempContext.zip(staged))
        .andThen(
          (upload) =>
            new ResultAsync(
              this.prompts.generatePlugin(
                this.pluginService.generatePlugin(upload, this.configDir, this.commandMetadata, this.authKey)
              )
            )
        )
        .map(async (stream) => pluginContext.save(await tempContext.save(stream)));
    });
    if (generated.isErr()) {
      this.reportGenerationProblem(generated.error, sourceDirectory);
      return ActionResult.failed();
    }

    this.prompts.installPluginLocally(pluginDirectory);
    if (couldPublishInstead) {
      this.prompts.previewOnly();
    }

    return ActionResult.success();
  };

  /** A record, a staging and a generation fault land here alike; only the wording differs. */
  private readonly reportGenerationProblem = (
    problem: ServiceError | PluginConfigWriteFailure,
    sourceDirectory: DirectoryPath
  ) =>
    typeof problem === 'string'
      ? this.prompts.configNotPrepared(problem, sourceDirectory)
      : this.prompts.pluginGenerationError(problem.errorMessage);
}
