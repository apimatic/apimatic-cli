import { err, ok } from 'neverthrow';
import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { MERGE_NEEDS_RESOLVING, SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { codegenVersionFor, isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { RecordProblem, ShareHookInstall } from '../../types/sdk/repository-state.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { replacesDirectory } from '../../types/sdk/sdk-destination.js';
import { favouring, resolving } from '../../types/sdk/settlement.js';
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
      const { repository, paths } = looked.value;
      const choice = await this.prompts.unresolvedChoice(paths, sdk);
      if (choice === undefined || choice === 'resolve') {
        this.prompts.resolveLater();
        return ActionResult.failed();
      }
      const settled = await repository.settleUnresolved(choice, paths);
      if (settled.isErr()) {
        this.prompts.conflictsNotSettled(settled.error.reason);
        return ActionResult.failed();
      }
      this.prompts.conflictsResolved(choice, paths, sdk);
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
        const generated = await repository.snapshotGenerated(tempSdk);
        const recorded = generated.isErr()
          ? err<ShareHookInstall, RecordProblem>({ step: 'snapshot', reason: generated.error.reason })
          : await repository.record(generated.value, generation);
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

      const { repository, base } = destination;
      const regenerated = await repository.regenerate(base, tempSdk);
      if (regenerated.isErr()) {
        this.prompts.customCodeFailed(regenerated.error.reason);
        return ActionResult.failed();
      }
      const regeneration = regenerated.value;
      const { plan } = regeneration.merge;
      const choice = plan.hasConflicts() && canAsk ? await this.prompts.conflictChoice(plan, sdk) : 'resolve';
      if (choice === undefined || choice === 'cancel') {
        this.prompts.runCancelled(sdk);
        return ActionResult.cancelled();
      }
      const settlement = choice === 'resolve' ? resolving(regeneration) : favouring(choice, regeneration);
      const written = await repository.write(base, settlement.plan, tempSdk);
      if (written.isErr()) {
        if (written.error.kind === 'notApplied') {
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
      const staged = await repository.stageConflicts(regeneration.merge);
      if (staged.isErr()) {
        this.prompts.conflictsNotStaged(staged.error.reason);
      }
      if (canAsk) {
        this.prompts.conflictSteps(settlement.plan);
      } else {
        this.prompts.conflicts(settlement.plan, sdk);
      }
      return ActionResult.failed(MERGE_NEEDS_RESOLVING);
    });
  };
}
