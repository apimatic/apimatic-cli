import { ok } from 'neverthrow';
import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { isAvailableLanguage } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { SdkContext } from '../../types/sdk-context.js';
import { recordingNotice } from '../../types/sdk/recording-notice.js';
import { GenerationRequest, SdkGeneration } from '../../types/sdk/sdk-generation.js';
import { settle } from '../../types/sdk/settlement.js';
import { noticeFor, onConflictFor, RunMode, writeModeFor } from '../../types/sdk/write-mode.js';

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly sdkGenerationService: SdkGenerationService = new SdkGenerationService();
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
    sdk: DirectoryPath,
    requested: GenerationRequest,
    run: RunMode,
    packageSettingsDirectory?: DirectoryPath
  ): Promise<ActionResult> => {
    if (!isAvailableLanguage(requested.language)) {
      this.prompts.languageNotAvailable(requested.language);
      return ActionResult.failed();
    }
    const generation = SdkGeneration.create(requested);
    if (generation === undefined) {
      this.prompts.generationNotOffered(requested);
      return ActionResult.failed();
    }
    const sourceDirectory = project.sourceDirectory();
    // The SDK directory is emptied before the SDK is written, so one holding the source would delete it.
    if (project.isSourceWithin(sdk)) {
      this.prompts.destinationContainsSource(sourceDirectory, sdk);
      return ActionResult.failed();
    }
    if (!(await project.sourceExists())) {
      this.prompts.sourceDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }
    if (!(await project.specsExist())) {
      this.prompts.specDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }

    const sdkContext = new SdkContext(sdk);
    const inspected = await sdkContext.destination(generation);
    const onConflict = onConflictFor(run);
    const unresolved =
      inspected.isOk() && inspected.value.kind === 'unresolved' && onConflict !== 'refuse'
        ? inspected.value
        : undefined;
    if (unresolved !== undefined) {
      const choice = onConflict === 'ask' ? await this.prompts.unresolvedChoice(unresolved.paths, sdk) : 'generated';
      if (choice === 'resolve' || choice === 'cancel') {
        this.prompts.resolveLater();
        return choice === 'resolve' ? ActionResult.actionRequired() : ActionResult.cancelled();
      }
      const settled = await unresolved.repository.settleUnresolved(choice, unresolved.paths);
      if (settled.isErr()) {
        this.prompts.conflictsNotSettled(settled.error);
        return ActionResult.failed();
      }
      this.prompts.conflictsResolved(choice, unresolved.paths, sdk);
    }
    const looked = unresolved === undefined ? inspected : await sdkContext.destination(generation);
    if (looked.isErr()) {
      this.prompts.directoryNotInspected(looked.error);
      return ActionResult.failed();
    }
    // Left unresolved by a run that could not ask, or by a settling that did not clear every file.
    if (looked.value.kind === 'unresolved') {
      this.prompts.conflictsUnresolved(looked.value.paths, sdk);
      return ActionResult.actionRequired();
    }
    const destination = looked.value;
    const notice = noticeFor(destination);
    if (notice !== undefined) {
      this.prompts.destinationNotice(notice);
    }
    const mode = writeModeFor(destination, run, await sdkContext.exists());
    if (mode.kind === 'refuse') {
      this.prompts.refused(mode.because, sdk);
      return ActionResult.failed();
    }
    if (mode.confirmOverwrite && !(await this.prompts.overwriteSdk(sdk))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory): Promise<ActionResult> => {
      const build = await project.buildZip(tempDirectory, packageSettingsDirectory);
      if (build.isErr()) {
        this.prompts.srcDirNotZipped(sourceDirectory, build.error);
        return ActionResult.failed();
      }
      const response = await this.prompts.generateSdk(
        this.sdkGenerationService.generateSdk(
          build.value,
          generation.language,
          generation.stability,
          this.configDir,
          this.commandMetadata,
          this.authKey
        )
      );
      if (response.isErr()) {
        this.prompts.sdkGenerationServiceError(response.error);
        return ActionResult.failed();
      }
      const archive = await new TempContext(tempDirectory).save(response.value);
      const unpacked = await sdkContext.loadSdkInTempDirectory(tempDirectory, archive);
      if (unpacked.isErr()) {
        this.prompts.sdkNotUnzipped(unpacked.error);
        return ActionResult.failed();
      }
      const tempSdk = unpacked.value;

      switch (mode.kind) {
        case 'save': {
          const saved = await sdkContext.save(tempSdk);
          this.prompts.sdkGenerated(saved);
          if (mode.suggestGitInit) {
            this.prompts.gitInitSteps(saved);
          }
          return ActionResult.success();
        }
        case 'init':
        case 'record': {
          const opened = mode.kind === 'init' ? await sdkContext.initRepository() : ok(mode.repository);
          if (opened.isErr()) {
            this.prompts.repositoryNotInitialised(sdk, opened.error);
            return ActionResult.failed();
          }
          await sdkContext.save(tempSdk);
          if (mode.kind === 'init') {
            this.prompts.repositoryInitialised(sdk);
          } else if (mode.announceRepository) {
            this.prompts.repositoryFound(sdk);
          } else if (mode.warnReplacedRecord) {
            this.prompts.recordedSdkReplaced(sdk);
          }
          const recorded = await opened.value.recordFresh(tempSdk, generation);
          this.prompts.recorded(recordingNotice(recorded, 'fresh'));
          this.prompts.sdkGenerated(sdk);
          return ActionResult.success();
        }
        case 'merge': {
          const { repository, base } = mode;
          const regenerated = await repository.regenerate(base, tempSdk);
          if (regenerated.isErr()) {
            this.prompts.customCodeFailed(regenerated.error);
            return ActionResult.failed();
          }
          const regeneration = regenerated.value;
          const { plan } = regeneration.merge;
          if (plan.hasConflicts() && mode.onConflict === 'refuse') {
            this.prompts.conflictsNotAsked(plan, sdk);
            return ActionResult.failed();
          }
          const choice = !plan.hasConflicts()
            ? 'resolve'
            : mode.onConflict === 'ask'
            ? await this.prompts.conflictChoice(plan, sdk)
            : 'generated';
          if (choice === 'cancel') {
            this.prompts.runCancelled(sdk);
            return ActionResult.cancelled();
          }
          const settlement = settle(regeneration, choice);
          const written = await repository.write(base, settlement, tempSdk);
          if (written.isErr()) {
            if ('kind' in written.error) {
              this.prompts.sdkNotWritten(sdk, written.error);
            } else {
              this.prompts.customCodeFailed(written.error);
            }
            return ActionResult.failed();
          }
          const recorded = await repository.record(regeneration.generated, generation);
          this.prompts.recorded(recordingNotice(recorded, 'merge'));
          if (settlement.settled !== undefined) {
            this.prompts.conflictsResolved(settlement.settled.side, settlement.settled.paths, sdk);
          }
          this.prompts.sdkMerged(sdk, settlement.plan);
          if (!settlement.plan.hasConflicts()) {
            return ActionResult.success();
          }
          const staged = await repository.stageConflicts(regeneration);
          if (staged.isErr()) {
            this.prompts.conflictsNotStaged(staged.error);
          }
          this.prompts.conflictSteps(settlement.plan, sdk, staged.isOk());
          return ActionResult.actionRequired();
        }
      }
    });
  };
}
