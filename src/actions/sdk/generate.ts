import { ok } from 'neverthrow';
import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { codegenVersionFor, isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { SdkContext } from '../../types/sdk-context.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { favouring, resolving } from '../../types/sdk/settlement.js';
import { creating, noticeFor, RunMode, writeModeFor } from '../../types/sdk/write-mode.js';

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
    language: Language,
    stability: Stability,
    run: RunMode,
    packageSettingsDirectory?: DirectoryPath
  ): Promise<ActionResult> => {
    if (!isAvailableLanguage(language)) {
      this.prompts.languageNotAvailable(language);
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
    const generation: SdkGeneration = { language, codegenVersion: codegenVersionFor(language, stability), stability };

    const inspected = await sdkContext.destination(generation);
    const unresolved =
      inspected.isOk() && inspected.value.kind === 'unresolved' && run.interaction === 'ask'
        ? inspected.value
        : undefined;
    if (unresolved !== undefined) {
      const choice = await this.prompts.unresolvedChoice(unresolved.paths, sdk);
      if (choice === undefined || choice === 'resolve') {
        this.prompts.resolveLater();
        return ActionResult.failed();
      }
      const settled = await unresolved.repository.settleUnresolved(choice, unresolved.paths);
      if (settled.isErr()) {
        this.prompts.conflictsNotSettled(settled.error.reason);
        return ActionResult.failed();
      }
      this.prompts.conflictsResolved(choice, unresolved.paths, sdk);
    }
    const looked = unresolved === undefined ? inspected : await sdkContext.destination(generation);
    if (looked.isErr()) {
      this.prompts.directoryNotInspected(sdk, looked.error);
      return ActionResult.failed();
    }
    // Left unresolved by a run that could not ask, or by a settling that did not clear every file.
    if (looked.value.kind === 'unresolved') {
      this.prompts.conflictsUnresolved(looked.value.paths, sdk);
      return ActionResult.failed();
    }
    const destination = looked.value;
    const notice = noticeFor(destination);
    if (notice !== undefined) {
      this.prompts.destinationNotice(notice, generation, sdk);
    }
    const proposed = writeModeFor(destination, run, await sdkContext.exists());
    if (proposed.kind === 'refuse') {
      this.prompts.refused(proposed.because, sdk);
      return ActionResult.failed();
    }
    if (proposed.confirmOverwrite && !(await this.prompts.overwriteSdk(sdk))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }
    const mode = proposed.kind === 'askToCreate' ? creating(await this.prompts.createRepository(sdk)) : proposed;
    if (mode.kind === 'save' && mode.warnNoRepository) {
      this.prompts.repositoryNotCreated(sdk);
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
          language,
          stability,
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
          return ActionResult.success();
        }
        case 'init':
        case 'record': {
          const opened = mode.kind === 'init' ? await sdkContext.initRepository() : ok(mode.repository);
          if (opened.isErr()) {
            this.prompts.repositoryNotInitialised(sdk, opened.error.reason);
            return ActionResult.failed();
          }
          const repository = opened.value;
          await sdkContext.save(tempSdk);
          if (mode.kind === 'init') {
            this.prompts.repositoryInitialised(sdk);
          }
          const generated = await repository.snapshotGenerated(tempSdk);
          if (generated.isErr()) {
            this.prompts.snapshotNotRecorded(generated.error.reason);
            this.prompts.sdkGenerated(sdk);
            return ActionResult.success();
          }
          const recorded = await repository.record(generated.value, generation);
          if (recorded.isErr() && recorded.error.step === 'snapshot') {
            this.prompts.snapshotNotRecorded(recorded.error.reason);
          } else if (recorded.isErr()) {
            this.prompts.shareHookNotInstalled(recorded.error.reason);
          } else if (recorded.value.kind !== 'installed') {
            this.prompts.shareHookNeedsOneStep(recorded.value);
          } else if (recorded.value.written) {
            this.prompts.shareHookInstalled(recorded.value.file);
          }
          this.prompts.sdkGenerated(sdk);
          return ActionResult.success();
        }
        case 'merge': {
          const { repository, base } = mode;
          const regenerated = await repository.regenerate(base, tempSdk);
          if (regenerated.isErr()) {
            this.prompts.customCodeFailed(regenerated.error.reason);
            return ActionResult.failed();
          }
          const regeneration = regenerated.value;
          const { plan } = regeneration.merge;
          if (plan.hasConflicts() && mode.onConflict === 'refuse') {
            this.prompts.conflictsNotAsked(plan, sdk);
            return ActionResult.failed();
          }
          const choice =
            plan.hasConflicts() && mode.onConflict === 'ask' ? await this.prompts.conflictChoice(plan, sdk) : 'resolve';
          if (choice === undefined || choice === 'cancel') {
            this.prompts.runCancelled(sdk);
            return ActionResult.cancelled();
          }
          const settlement = choice === 'resolve' ? resolving(regeneration) : favouring(choice, regeneration);
          const written = await repository.write(base, settlement, tempSdk);
          if (written.isErr()) {
            if ('kind' in written.error) {
              this.prompts.sdkNotWritten(sdk, written.error);
            } else {
              this.prompts.customCodeFailed(written.error.reason);
            }
            return ActionResult.failed();
          }
          const recorded = await repository.record(regeneration.generated, generation);
          if (recorded.isErr() && recorded.error.step === 'snapshot') {
            this.prompts.snapshotNotRecordedAfterMerge(recorded.error.reason);
          } else if (recorded.isErr()) {
            this.prompts.shareHookNotInstalled(recorded.error.reason);
          } else if (recorded.value.kind !== 'installed') {
            this.prompts.shareHookNeedsOneStep(recorded.value);
          } else if (recorded.value.written) {
            this.prompts.shareHookInstalled(recorded.value.file);
          }
          if (settlement.settled !== undefined) {
            this.prompts.conflictsResolved(settlement.settled.side, settlement.settled.paths, sdk);
          }
          this.prompts.sdkMerged(sdk, settlement.plan);
          if (!settlement.plan.hasConflicts()) {
            return ActionResult.success();
          }
          const staged = await repository.stageConflicts(regeneration);
          if (staged.isErr()) {
            this.prompts.conflictsNotStaged(staged.error.reason);
          }
          if (mode.onConflict === 'ask') {
            this.prompts.conflictSteps(settlement.plan);
          } else {
            this.prompts.conflicts(settlement.plan, sdk);
          }
          this.prompts.mergeNeedsResolving();
          return ActionResult.failed();
        }
      }
    });
  };
}
