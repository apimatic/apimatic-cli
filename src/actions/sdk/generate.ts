import { err, ok, Result, ResultAsync } from 'neverthrow';
import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { envInfo } from '../../infrastructure/env-info.js';
import { MERGE_NEEDS_RESOLVING, SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { codegenVersionFor, isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { TreeId } from '../../types/git/tree-id.js';
import { Regeneration, SdkRepositoryContext, SdkRepositoryProblem } from '../../types/sdk-repository-context.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { replacesDirectory } from '../../types/sdk/sdk-destination.js';
import { favouringGenerator, resolving, Settlement } from '../../types/sdk/settlement.js';
import { terminal } from '../../utils/terminal-utils.js';

/**
 * One run of `sdk generate`, read top to bottom. Every prompt is named here: called, or handed
 * to one of the steps below the class, which take the prompts they may use as arguments and
 * have no other way to speak. What a state means lives in `src/types/sdk/`; the I/O in the contexts.
 */
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
    sdkDirectory: DirectoryPath,
    language: Language,
    stability: Stability,
    force: boolean,
    apiVersion?: string,
    packageSettingsDirectory?: DirectoryPath
  ): Promise<ActionResult> => {
    if (!isAvailableLanguage(language)) {
      this.prompts.languageNotAvailable(language);
      return ActionResult.failed();
    }
    const sourceDirectory = project.sourceDirectory();
    if (project.isSourceDirectory(sdkDirectory)) {
      this.prompts.sameSourceAndSdkDir(sourceDirectory);
      return ActionResult.failed();
    }
    if (!(await project.sourceExists())) {
      this.prompts.sourceDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }
    if (apiVersion && !(await project.isVersioned())) {
      this.prompts.apiVersionOnlyApplicableWithVersionedBuild();
    }
    const toBuild = await project.versionToBuild(apiVersion, this.prompts.selectVersion);
    if (toBuild.isErr()) {
      this.prompts.noVersionToBuild(toBuild.error, sourceDirectory);
      return ActionResult.failed();
    }
    const buildFrom = toBuild.value;
    if (!(await buildFrom.specsExist())) {
      this.prompts.specDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }

    const sdkContext = buildFrom.sdk(language, sdkDirectory);
    const sdk = sdkContext.directory();
    const generation: SdkGeneration = { language, codegenVersion: codegenVersionFor(language, stability), stability };
    const canAsk = !force && terminal.isInteractive();
    const { unresolvedChoice, resolveLater, conflictsNotSettled, resolvedForGenerator, previousRestored } =
      this.prompts;
    const { snapshotNotRecorded, shareHookNeedsOneStep, shareHookNotInstalled } = this.prompts;
    const { sdkMerged, conflictsNotStaged, conflicts, conflictSteps } = this.prompts;

    // Decided before anything is uploaded, so a refused or declined run stops here. Conflicts the
    // last run left unresolved in git's index are settled first, and the directory looked at again, once.
    let looked = await sdkContext.destination(generation);
    if (looked.isOk() && looked.value.kind === 'unresolved') {
      const { repository, paths } = looked.value;
      if (!canAsk) {
        this.prompts.conflictsUnresolved(paths, repository.sdkDirectory());
        return ActionResult.failed();
      }
      const settled = await settleMarkers(repository, paths, {
        unresolvedChoice,
        resolveLater,
        conflictsNotSettled,
        resolvedForGenerator,
        previousRestored
      });
      if (settled.isErr()) {
        return settled.error;
      }
      looked = await sdkContext.destination(generation);
    }
    if (looked.isErr()) {
      if (looked.error.kind === 'nestedSdkDirectory') {
        this.prompts.nestedSdkDirectory(sdk, looked.error);
      } else {
        this.prompts.directoryNotInspected(looked.error.reason);
      }
      return ActionResult.failed();
    }
    if (looked.value.kind === 'unresolved') {
      this.prompts.conflictsUnresolved(looked.value.paths, looked.value.repository.sdkDirectory());
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
    if (
      !force &&
      replacesDirectory(destination) &&
      (await sdkContext.exists()) &&
      !(await this.prompts.overwriteSdk(sdk))
    ) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const srcDirZip = await buildFrom.srcDirZip(tempDirectory, packageSettingsDirectory);
      if (srcDirZip.isErr()) {
        this.prompts.srcDirNotZipped(sourceDirectory, srcDirZip.error);
        return ActionResult.failed();
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
        return ActionResult.failed();
      }
      const archive = await new TempContext(tempDirectory).save(response.value);
      const tempSdk = await sdkContext.loadSdkInTempDirectory(tempDirectory, archive);
      if (tempSdk.isErr()) {
        this.prompts.sdkNotUnzipped(tempSdk.error);
        return ActionResult.failed();
      }

      if (destination.kind === 'overwrite') {
        this.prompts.sdkGenerated(await sdkContext.save(tempSdk.value));
        return ActionResult.success();
      }

      if (destination.kind === 'record') {
        // Initialised only now, once generation succeeded, so a failed run leaves no repository behind.
        const opened =
          destination.repository === undefined ? await sdkContext.initRepository() : ok(destination.repository);
        if (opened.isErr()) {
          this.prompts.customCodeFailed(opened.error.reason);
          return ActionResult.failed();
        }
        const repository = opened.value;
        await sdkContext.save(tempSdk.value);
        if (destination.repository === undefined) {
          this.prompts.repositoryInitialised(sdk);
        }
        await recordSnapshot(repository, await repository.snapshotGenerated(tempSdk.value), generation, {
          snapshotNotRecorded,
          shareHookNeedsOneStep,
          shareHookNotInstalled
        });
        this.prompts.sdkGenerated(sdk);
        return ActionResult.success();
      }

      const { repository, base } = destination;
      const regenerated = await repository.regenerate(base, tempSdk.value);
      if (regenerated.isErr()) {
        this.prompts.customCodeFailed(regenerated.error.reason);
        return ActionResult.failed();
      }
      const settled = await settleConflicts(
        regenerated.value,
        sdk,
        canAsk,
        () => repository.regenerate(base, tempSdk.value, 'generated'),
        this.prompts.conflictChoice
      );
      if (settled.isErr()) {
        const { error } = settled;
        if (error === 'kept') {
          this.prompts.sdkKept(sdk);
          return ActionResult.cancelled();
        }
        this.prompts.customCodeFailed(error.reason);
        return ActionResult.failed();
      }
      const written = await repository.write(base, settled.value.plan);
      if (written.isErr()) {
        this.prompts.customCodeFailed(written.error.reason);
        return ActionResult.failed();
      }
      await recordSnapshot(repository, ok(settled.value.regeneration.generated), generation, {
        snapshotNotRecorded,
        shareHookNeedsOneStep,
        shareHookNotInstalled
      });
      return closeMerge(repository, settled.value, canAsk, {
        resolvedForGenerator,
        sdkMerged,
        conflictsNotStaged,
        conflicts,
        conflictSteps
      });
    });
  };
}

/**
 * The steps below take the prompts they may use as arguments, each the exact method `execute`
 * names, and have no `this`, so there is no other way for them to speak.
 */

/** The last run's markers are still in the files: the developer settles them, or the run stops. */
async function settleMarkers(
  repository: SdkRepositoryContext,
  paths: readonly RelativeFilePath[],
  said: Pick<
    SdkGeneratePrompts,
    'unresolvedChoice' | 'resolveLater' | 'conflictsNotSettled' | 'resolvedForGenerator' | 'previousRestored'
  >
): Promise<Result<void, ActionResult>> {
  const sdk = repository.sdkDirectory();
  const choice = await said.unresolvedChoice(paths, sdk);
  if (choice === undefined || choice === 'resolve') {
    said.resolveLater();
    return err(ActionResult.failed());
  }
  const settled =
    choice === 'generated' ? await repository.resolveForGenerator(paths) : await repository.restorePrevious(paths);
  if (settled.isErr()) {
    said.conflictsNotSettled(settled.error.reason);
    return err(ActionResult.failed());
  }
  if (choice === 'generated') {
    said.resolvedForGenerator(paths, sdk);
  } else {
    said.previousRestored(sdk);
  }
  return ok(undefined);
}

/** Conflicts are settled before anything is written; a run that cannot ask leaves markers. */
async function settleConflicts(
  regeneration: Regeneration,
  sdk: DirectoryPath,
  canAsk: boolean,
  again: () => Promise<Result<Regeneration, SdkRepositoryProblem>>,
  ask: SdkGeneratePrompts['conflictChoice']
): Promise<Result<Settlement, 'kept' | SdkRepositoryProblem>> {
  const { plan } = regeneration.merge;
  if (!plan.hasConflicts()) {
    return ok(resolving(regeneration));
  }
  const choice = canAsk ? await ask(plan, sdk) : 'resolve';
  if (choice === undefined || choice === 'keep') {
    return err('kept');
  }
  if (choice === 'resolve') {
    return ok(resolving(regeneration));
  }
  return (await again()).map((favoured) => favouringGenerator(regeneration, favoured));
}

/**
 * The snapshot and the record, then the hook that shares snapshots on push, (re)installed quietly.
 * Neither failure stops the run: the SDK is on disk, and a run without its snapshot asks before replacing it.
 */
async function recordSnapshot(
  repository: SdkRepositoryContext,
  generated: Result<TreeId, SdkRepositoryProblem>,
  generation: SdkGeneration,
  said: Pick<SdkGeneratePrompts, 'snapshotNotRecorded' | 'shareHookNeedsOneStep' | 'shareHookNotInstalled'>
): Promise<void> {
  const recorded = await generated.asyncAndThen(
    (tree) => new ResultAsync(repository.recordGeneration(tree, generation, envInfo.getCLIVersion()))
  );
  if (recorded.isErr()) {
    return said.snapshotNotRecorded(recorded.error.reason);
  }
  const hook = await repository.installShareHook();
  if (hook.isErr()) {
    return said.shareHookNotInstalled(hook.error.reason);
  }
  if (hook.value.kind !== 'installed') {
    said.shareHookNeedsOneStep(hook.value);
  }
}

/** The summary; markers left for the developer go into git's index and stop the run with the steps. */
async function closeMerge(
  repository: SdkRepositoryContext,
  settlement: Settlement,
  canAsk: boolean,
  said: Pick<
    SdkGeneratePrompts,
    'resolvedForGenerator' | 'sdkMerged' | 'conflictsNotStaged' | 'conflicts' | 'conflictSteps'
  >
): Promise<ActionResult> {
  const sdk = repository.sdkDirectory();
  const { plan } = settlement;
  if (settlement.settledForGenerator.length > 0) {
    said.resolvedForGenerator(settlement.settledForGenerator, sdk);
  }
  said.sdkMerged(sdk, plan);
  if (!plan.hasConflicts()) {
    return ActionResult.success();
  }
  const staged = await repository.stageConflicts(settlement.regeneration.merge);
  if (staged.isErr()) {
    said.conflictsNotStaged(staged.error.reason);
  }
  if (canAsk) {
    said.conflictSteps(plan);
  } else {
    said.conflicts(plan, sdk);
  }
  return ActionResult.failed(MERGE_NEEDS_RESOLVING);
}
