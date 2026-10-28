import { ok, Result } from 'neverthrow';
import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { MERGE_NEEDS_RESOLVING, SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { codegenVersionFor, isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { TreeId } from '../../types/git/tree-id.js';
import { SdkContext } from '../../types/sdk-context.js';
import { SdkRepositoryContext } from '../../types/sdk-repository-context.js';
import { Regeneration, SdkRepositoryProblem } from '../../types/sdk/repository-state.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { replacesDirectory } from '../../types/sdk/sdk-destination.js';
import { favouring, resolving, Settlement } from '../../types/sdk/settlement.js';
import { terminal } from '../../utils/terminal-utils.js';

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
    force: boolean,
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

    const sdkContext = project.sdk(sdk);
    const generation: SdkGeneration = { language, codegenVersion: codegenVersionFor(language, stability), stability };
    const canAsk = !force && terminal.isInteractive();

    let looked = await sdkContext.destination(generation);
    if (looked.isOk() && looked.value.kind === 'unresolved' && canAsk) {
      if (!(await this.settleUnresolved(looked.value.repository, sdk, looked.value.paths))) {
        return ActionResult.failed();
      }
      looked = await sdkContext.destination(generation);
    }
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
    if (destination.kind === 'overwrite') {
      this.prompts.gitUnavailable(destination.found);
    } else if (destination.kind === 'record' && destination.because.kind === 'otherGeneration') {
      this.prompts.recordNotForThisGeneration(destination.because.recorded, generation, sdk);
    } else if (destination.kind === 'record' && destination.because.kind === 'snapshotMissing') {
      this.prompts.snapshotMissing(destination.because.fetch);
    }
    if (force && destination.kind === 'record' && destination.because.kind !== 'noRecord') {
      this.prompts.recordedSdkNotReplaced(sdk);
      return ActionResult.failed();
    }
    if (
      !force &&
      replacesDirectory(destination) &&
      (await sdkContext.exists()) &&
      !(await this.prompts.overwriteSdk(sdk))
    ) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }
    const withRepository =
      destination.kind !== 'noRepository' || (canAsk && (await this.prompts.createRepository(sdk)));
    if (!withRepository) {
      this.prompts.repositoryNotCreated(sdk);
    }

    return await withDirPath(async (tempDirectory) => {
      const tempSdk = await this.download(
        project,
        sdkContext,
        tempDirectory,
        language,
        stability,
        packageSettingsDirectory
      );
      if (tempSdk === undefined) {
        return ActionResult.failed();
      }

      if (destination.kind === 'overwrite' || !withRepository) {
        this.prompts.sdkGenerated(await sdkContext.save(tempSdk));
        return ActionResult.success();
      }

      if (destination.kind === 'record' || destination.kind === 'noRepository') {
        const opened =
          destination.kind === 'noRepository' ? await sdkContext.initRepository() : ok(destination.repository);
        if (opened.isErr()) {
          this.prompts.repositoryNotInitialised(sdk, opened.error.reason);
          return ActionResult.failed();
        }
        const repository = opened.value;
        await sdkContext.save(tempSdk);
        if (destination.kind === 'noRepository') {
          this.prompts.repositoryInitialised(sdk);
        }
        await this.recordSnapshot(
          repository,
          await repository.snapshotGenerated(tempSdk),
          generation,
          this.prompts.snapshotNotRecorded
        );
        this.prompts.sdkGenerated(sdk);
        return ActionResult.success();
      }

      const { repository, base } = destination;
      const regenerated = await repository.regenerate(base, tempSdk);
      if (regenerated.isErr()) {
        this.prompts.customCodeFailed(regenerated.error.reason);
        return ActionResult.failed();
      }
      const settled = await this.settleConflicts(regenerated.value, sdk, canAsk);
      if (settled === undefined) {
        this.prompts.runCancelled(sdk);
        return ActionResult.cancelled();
      }
      const written = await repository.write(base, settled.plan, tempSdk);
      if (written.isErr()) {
        if (written.error.kind === 'notApplied') {
          this.prompts.sdkNotWritten(sdk, written.error);
        } else {
          this.prompts.customCodeFailed(written.error.reason);
        }
        return ActionResult.failed();
      }
      await this.recordSnapshot(
        repository,
        ok(settled.regeneration.generated),
        generation,
        this.prompts.snapshotNotRecordedAfterMerge
      );
      return this.closeMerge(repository, sdk, settled, canAsk);
    });
  };

  /** Asks about the files the last run left unresolved and settles them; false when the run must stop. */
  private async settleUnresolved(
    repository: SdkRepositoryContext,
    sdk: DirectoryPath,
    paths: readonly RelativeFilePath[]
  ): Promise<boolean> {
    const choice = await this.prompts.unresolvedChoice(paths, sdk);
    if (choice === undefined || choice === 'resolve') {
      this.prompts.resolveLater();
      return false;
    }
    const settled = await repository.settleUnresolved(choice, paths);
    if (settled.isErr()) {
      this.prompts.conflictsNotSettled(settled.error.reason);
      return false;
    }
    this.prompts.conflictsResolved(choice, paths, sdk);
    return true;
  }

  /** The fresh SDK unpacked in `tempDirectory`, or none when a step failed and was reported. */
  private async download(
    project: ProjectContext,
    sdkContext: SdkContext,
    tempDirectory: DirectoryPath,
    language: Language,
    stability: Stability,
    packageSettingsDirectory: DirectoryPath | undefined
  ): Promise<DirectoryPath | undefined> {
    const srcDirZip = await project.srcDirZip(tempDirectory, packageSettingsDirectory);
    if (srcDirZip.isErr()) {
      this.prompts.srcDirNotZipped(project.sourceDirectory(), srcDirZip.error);
      return undefined;
    }
    const response = await this.prompts.generateSdk(
      this.sdkGenerationService.generateSdk(
        srcDirZip.value,
        language,
        stability,
        this.configDir,
        this.commandMetadata,
        this.authKey
      )
    );
    if (response.isErr()) {
      this.prompts.sdkGenerationServiceError(response.error);
      return undefined;
    }
    const archive = await new TempContext(tempDirectory).save(response.value);
    const tempSdk = await sdkContext.loadSdkInTempDirectory(tempDirectory, archive);
    if (tempSdk.isErr()) {
      this.prompts.sdkNotUnzipped(tempSdk.error);
      return undefined;
    }
    return tempSdk.value;
  }

  /** The merge as the developer settles it; none when they cancelled the run, or backed out of the question. */
  private async settleConflicts(
    regeneration: Regeneration,
    sdk: DirectoryPath,
    canAsk: boolean
  ): Promise<Settlement | undefined> {
    const { plan } = regeneration.merge;
    if (!plan.hasConflicts()) {
      return resolving(regeneration);
    }
    const choice = canAsk ? await this.prompts.conflictChoice(plan, sdk) : 'resolve';
    if (choice === undefined || choice === 'cancel') {
      return undefined;
    }
    return choice === 'resolve' ? resolving(regeneration) : favouring(choice, regeneration);
  }

  /** Records the snapshot and installs the hook; a failure in either is a warning, since the SDK is already written. */
  private async recordSnapshot(
    repository: SdkRepositoryContext,
    generated: Result<TreeId, SdkRepositoryProblem>,
    generation: SdkGeneration,
    snapshotNotRecorded: (reason: string) => void
  ): Promise<void> {
    if (generated.isErr()) {
      return snapshotNotRecorded(generated.error.reason);
    }
    const recorded = await repository.recordGeneration(generated.value, generation);
    if (recorded.isErr()) {
      return snapshotNotRecorded(recorded.error.reason);
    }
    const hook = await repository.installShareHook();
    if (hook.isErr()) {
      return this.prompts.shareHookNotInstalled(hook.error.reason);
    }
    if (hook.value.kind !== 'installed') {
      this.prompts.shareHookNeedsOneStep(hook.value);
    } else if (hook.value.written) {
      this.prompts.shareHookInstalled(hook.value.file);
    }
  }

  /** Reports the merge, and stages what is left in conflict for the developer's own tools. */
  private async closeMerge(
    repository: SdkRepositoryContext,
    sdk: DirectoryPath,
    settlement: Settlement,
    canAsk: boolean
  ): Promise<ActionResult> {
    const { plan, settled } = settlement;
    if (settled !== undefined) {
      this.prompts.conflictsResolved(settled.side, settled.paths, sdk);
    }
    this.prompts.sdkMerged(sdk, plan);
    if (!plan.hasConflicts()) {
      return ActionResult.success();
    }
    const staged = await repository.stageConflicts(settlement.regeneration.merge);
    if (staged.isErr()) {
      this.prompts.conflictsNotStaged(staged.error.reason);
    }
    if (canAsk) {
      this.prompts.conflictSteps(plan);
    } else {
      this.prompts.conflicts(plan, sdk);
    }
    return ActionResult.failed(MERGE_NEEDS_RESOLVING);
  }
}
