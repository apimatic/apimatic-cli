import { err, ok, Result, ResultAsync } from 'neverthrow';
import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { MERGE_NEEDS_RESOLVING, SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { codegenVersionFor, isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { FilePath } from '../../types/file/filePath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { TreeId } from '../../types/git/tree-id.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import { SdkContext } from '../../types/sdk-context.js';
import {
  Regeneration,
  SdkRepositoryContext,
  SdkRepositoryProblem,
  ShareHookInstall
} from '../../types/sdk-repository-context.js';
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { replacesDirectory } from '../../types/sdk/sdk-destination.js';
import { favouring, resolving, Settlement } from '../../types/sdk/settlement.js';
import { ConflictChoice, ConflictSide, MergePlan, UnresolvedChoice } from '../../types/sdk/merge-plan.js';
import { FileProblem } from '../../types/file/file-problem.js';
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
    sdkDirectory: DirectoryPath | undefined,
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
    if (sdkDirectory !== undefined && project.isSourceWithin(sdkDirectory)) {
      this.prompts.destinationContainsSource(sourceDirectory, sdkDirectory);
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

    const sdkContext = project.sdk(language, sdkDirectory);
    const sdk = sdkContext.directory();
    const generation: SdkGeneration = { language, codegenVersion: codegenVersionFor(language, stability), stability };
    const canAsk = !force && terminal.isInteractive();

    let looked = await sdkContext.destination(generation);
    if (looked.isOk() && looked.value.kind === 'unresolved') {
      const { repository, paths } = looked.value;
      if (!canAsk) {
        this.prompts.conflictsUnresolved(paths, repository.sdkDirectory());
        return ActionResult.failed();
      }
      const settled = await settleUnresolvedConflicts(
        repository,
        paths,
        this.prompts.unresolvedChoice,
        this.prompts.resolveLater,
        this.prompts.conflictsNotSettled,
        this.prompts.conflictsResolved
      );
      if (settled.isErr()) {
        return settled.error;
      }
      looked = await sdkContext.destination(generation);
    }
    if (looked.isErr()) {
      this.prompts.directoryNotInspected(sdk, looked.error);
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
    if (force && destination.kind === 'record' && destination.because.kind !== 'noRepository' && destination.because.kind !== 'noRecord') {
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
      destination.kind !== 'record' ||
      destination.repository !== undefined ||
      (canAsk && (await this.prompts.createRepository(sdk)));
    if (!withRepository) {
      this.prompts.repositoryNotCreated(sdk);
    }

    return await withDirPath(async (tempDirectory) => {
      const tempSdk = await download(
        project,
        sdkContext,
        tempDirectory,
        packageSettingsDirectory,
        (srcDirZip) =>
          this.sdkGenerationService.generateSdk(
            srcDirZip,
            language,
            stability,
            this.configDir,
            this.commandMetadata,
            this.authKey
          ),
        this.prompts.generateSdk,
        this.prompts.srcDirNotZipped,
        this.prompts.sdkGenerationServiceError,
        this.prompts.sdkNotUnzipped
      );
      if (tempSdk.isErr()) {
        return tempSdk.error;
      }

      if (destination.kind === 'overwrite' || !withRepository) {
        this.prompts.sdkGenerated(await sdkContext.save(tempSdk.value));
        return ActionResult.success();
      }

      if (destination.kind === 'record') {
        const opened =
          destination.repository === undefined ? await sdkContext.initRepository() : ok(destination.repository);
        if (opened.isErr()) {
          this.prompts.repositoryNotInitialised(sdk, opened.error.reason);
          return ActionResult.failed();
        }
        const repository = opened.value;
        await sdkContext.save(tempSdk.value);
        if (destination.repository === undefined) {
          this.prompts.repositoryInitialised(sdk);
        }
        await recordSnapshot(
          repository,
          await repository.snapshotGenerated(tempSdk.value),
          generation,
          this.prompts.snapshotNotRecorded,
          this.prompts.shareHookNotInstalled,
          this.prompts.shareHookInstalled,
          this.prompts.shareHookNeedsOneStep
        );
        this.prompts.sdkGenerated(sdk);
        return ActionResult.success();
      }

      const { repository, base } = destination;
      const regenerated = await repository.regenerate(base, tempSdk.value);
      if (regenerated.isErr()) {
        this.prompts.customCodeFailed(regenerated.error.reason);
        return ActionResult.failed();
      }
      const settled = await settleConflicts(regenerated.value, sdk, canAsk, this.prompts.conflictChoice);
      if (settled === undefined) {
        this.prompts.runCancelled(sdk);
        return ActionResult.cancelled();
      }
      const written = await repository.write(base, settled.plan, tempSdk.value);
      if (written.isErr()) {
        if (written.error.kind === 'notApplied') {
          this.prompts.sdkNotWritten(sdk, written.error);
        } else {
          this.prompts.customCodeFailed(written.error.reason);
        }
        return ActionResult.failed();
      }
      await recordSnapshot(
        repository,
        ok(settled.regeneration.generated),
        generation,
        this.prompts.snapshotNotRecordedAfterMerge,
        this.prompts.shareHookNotInstalled,
        this.prompts.shareHookInstalled,
        this.prompts.shareHookNeedsOneStep
      );
      return closeMerge(
        repository,
        settled,
        canAsk,
        this.prompts.conflictsResolved,
        this.prompts.sdkMerged,
        this.prompts.conflictsNotStaged,
        this.prompts.conflicts,
        this.prompts.conflictSteps
      );
    });
  };
}

async function settleUnresolvedConflicts(
  repository: SdkRepositoryContext,
  paths: readonly RelativeFilePath[],
  ask: (paths: readonly RelativeFilePath[], sdk: DirectoryPath) => Promise<UnresolvedChoice | undefined>,
  resolveLater: () => void,
  conflictsNotSettled: (reason: string) => void,
  conflictsResolved: (side: ConflictSide, paths: readonly RelativeFilePath[], sdk: DirectoryPath) => void
): Promise<Result<void, ActionResult>> {
  const sdk = repository.sdkDirectory();
  const choice = await ask(paths, sdk);
  if (choice === undefined || choice === 'resolve') {
    resolveLater();
    return err(ActionResult.failed());
  }
  const settled = await repository.settleUnresolved(choice, paths);
  if (settled.isErr()) {
    conflictsNotSettled(settled.error.reason);
    return err(ActionResult.failed());
  }
  conflictsResolved(choice, paths, sdk);
  return ok(undefined);
}

/** None when the developer cancelled the run, or backed out of the question. */
async function settleConflicts(
  regeneration: Regeneration,
  sdk: DirectoryPath,
  canAsk: boolean,
  ask: (plan: MergePlan, sdk: DirectoryPath) => Promise<ConflictChoice | undefined>
): Promise<Settlement | undefined> {
  const { plan } = regeneration.merge;
  if (!plan.hasConflicts()) {
    return resolving(regeneration);
  }
  const choice = canAsk ? await ask(plan, sdk) : 'resolve';
  if (choice === undefined || choice === 'cancel') {
    return undefined;
  }
  return choice === 'resolve' ? resolving(regeneration) : favouring(choice, regeneration);
}

async function recordSnapshot(
  repository: SdkRepositoryContext,
  generated: Result<TreeId, SdkRepositoryProblem>,
  generation: SdkGeneration,
  snapshotNotRecorded: (reason: string) => void,
  shareHookNotInstalled: (reason: string) => void,
  shareHookInstalled: (file: FilePath) => void,
  shareHookNeedsOneStep: (needed: Extract<ShareHookInstall, { kind: 'elsewhere' | 'notShell' }>) => void
): Promise<void> {
  const recorded = await generated.asyncAndThen(
    (tree) => new ResultAsync(repository.recordGeneration(tree, generation))
  );
  if (recorded.isErr()) {
    return snapshotNotRecorded(recorded.error.reason);
  }
  const hook = await repository.installShareHook();
  if (hook.isErr()) {
    return shareHookNotInstalled(hook.error.reason);
  }
  if (hook.value.kind !== 'installed') {
    shareHookNeedsOneStep(hook.value);
  } else if (hook.value.written) {
    shareHookInstalled(hook.value.file);
  }
}

async function closeMerge(
  repository: SdkRepositoryContext,
  settlement: Settlement,
  canAsk: boolean,
  conflictsResolved: (side: ConflictSide, paths: readonly RelativeFilePath[], sdk: DirectoryPath) => void,
  sdkMerged: (sdk: DirectoryPath, plan: MergePlan) => void,
  conflictsNotStaged: (reason: string) => void,
  conflicts: (plan: MergePlan, sdk: DirectoryPath) => void,
  conflictSteps: (plan: MergePlan) => void
): Promise<ActionResult> {
  const sdk = repository.sdkDirectory();
  const { plan, settled } = settlement;
  if (settled !== undefined) {
    conflictsResolved(settled.side, settled.paths, sdk);
  }
  sdkMerged(sdk, plan);
  if (!plan.hasConflicts()) {
    return ActionResult.success();
  }
  const staged = await repository.stageConflicts(settlement.regeneration.merge);
  if (staged.isErr()) {
    conflictsNotStaged(staged.error.reason);
  }
  if (canAsk) {
    conflictSteps(plan);
  } else {
    conflicts(plan, sdk);
  }
  return ActionResult.failed(MERGE_NEEDS_RESOLVING);
}

async function download(
  project: ProjectContext,
  sdkContext: SdkContext,
  tempDirectory: DirectoryPath,
  packageSettingsDirectory: DirectoryPath | undefined,
  generate: (srcDirZip: FilePath) => Promise<Result<NodeJS.ReadableStream, ServiceError>>,
  shown: (
    generating: Promise<Result<NodeJS.ReadableStream, ServiceError>>
  ) => Promise<Result<NodeJS.ReadableStream, ServiceError>>,
  srcDirNotZipped: (source: DirectoryPath, problem: FileProblem) => void,
  sdkGenerationServiceError: (error: ServiceError) => void,
  sdkNotUnzipped: (problem: FileProblem) => void
): Promise<Result<DirectoryPath, ActionResult>> {
  const srcDirZip = await project.srcDirZip(tempDirectory, packageSettingsDirectory);
  if (srcDirZip.isErr()) {
    srcDirNotZipped(project.sourceDirectory(), srcDirZip.error);
    return err(ActionResult.failed());
  }
  const response = await shown(generate(srcDirZip.value));
  if (response.isErr()) {
    sdkGenerationServiceError(response.error);
    return err(ActionResult.failed());
  }
  const archive = await new TempContext(tempDirectory).save(response.value);
  const tempSdk = await sdkContext.loadSdkInTempDirectory(tempDirectory, archive);
  if (tempSdk.isErr()) {
    sdkNotUnzipped(tempSdk.error);
    return err(ActionResult.failed());
  }
  return ok(tempSdk.value);
}
