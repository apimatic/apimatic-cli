import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { ConflictChoice, SdkGeneratePrompts, UnresolvedChoice } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { GitContext } from '../../types/git-context.js';
import { GitVersion } from '../../types/git/git-version.js';
import { GitService } from '../../infrastructure/git-service.js';

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly sdkGenerationService: SdkGenerationService = new SdkGenerationService();
  private readonly gitService: GitService = new GitService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  /**
   * `canAsk` is whether a question may be put to the developer at all; `force` answers every question
   * without asking. `gitInit` makes the SDK directory a repository of its own when it is not one.
   */
  public readonly execute = async (
    project: ProjectContext,
    sdk: DirectoryPath,
    language: Language,
    stability: Stability,
    force: boolean,
    canAsk: boolean,
    gitInit: boolean,
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

    const gitContext = new GitContext(sdk);
    const needsGit = gitInit || (await gitContext.hasGitDirectory());
    const gitVersion = needsGit ? await this.gitService.version() : GitVersion.none();
    if (needsGit && !gitVersion.isFound()) {
      this.prompts.gitUnavailable();
    }
    if (gitVersion.isFound() && !gitVersion.isSupported()) {
      this.prompts.gitVersionNotSupported(gitVersion);
    }
    const inspected = await gitContext.inspect(gitVersion, language, stability);
    if (inspected.isErr()) {
      this.prompts.repositoryNotInspected(sdk, inspected.error);
      return ActionResult.failed();
    }
    const repository = inspected.value;
    if (repository.operation.isUnderWay()) {
      this.prompts.operationInProgress(sdk, repository.operation);
      return ActionResult.failed();
    }
    if (repository.hasUnresolved()) {
      if (!force && !canAsk) {
        this.prompts.conflictsUnresolved(sdk, repository.unresolved);
        return ActionResult.actionRequired();
      }
      const choice: UnresolvedChoice = force
        ? 'generated'
        : await this.prompts.unresolvedChoice(sdk, repository.unresolved);
      if (choice === 'cancel') {
        this.prompts.resolveLater();
        return ActionResult.cancelled();
      }
      if (choice === 'resolve') {
        this.prompts.resolveLater();
        return ActionResult.actionRequired();
      }
      const settlement = await gitContext.settlementFor(choice, repository.unresolved);
      if (settlement.isErr()) {
        this.prompts.conflictsNotSettled(settlement.error);
        return ActionResult.failed();
      }
      const written = await gitContext.write(settlement.value);
      if (written.isErr()) {
        this.prompts.sdkNotWritten(sdk, written.error);
        return ActionResult.failed();
      }
      const marked = await this.gitService.unstage(sdk, repository.unresolved);
      if (marked.isErr()) {
        this.prompts.conflictsNotSettled(marked.error);
        return ActionResult.failed();
      }
      this.prompts.conflictsResolved(sdk, choice, repository.unresolved);
      // Once more, so a file the settling could not clear stops the run before anything is generated.
      const again = await gitContext.inspect(gitVersion, language, stability);
      if (again.isErr()) {
        this.prompts.repositoryNotInspected(sdk, again.error);
        return ActionResult.failed();
      }
      if (again.value.hasUnresolved()) {
        this.prompts.conflictsUnresolved(sdk, again.value.unresolved);
        return ActionResult.actionRequired();
      }
    }
    if (repository.isSnapshotMissing()) {
      this.prompts.snapshotMissing(sdk);
    }
    const mergeBase = repository.mergeBase();
    const shouldMakeRepository = gitVersion.isSupported() && gitInit && !repository.isRepository();
    const shouldRecord = shouldMakeRepository || repository.isRepository();
    const isRecordingFirstTime = repository.isRepository() && !repository.isRecorded();
    const shouldReplaceOldRecord = force && repository.isRecorded() && mergeBase === undefined;

    // A merge writes only what changed, so it never asks; a save replaces everything, so it does.
    if (!force && mergeBase === undefined && (await gitContext.hasFilesBesidesGit())) {
      if (!canAsk) {
        this.prompts.cannotAskToOverwrite(sdk);
        return ActionResult.failed();
      }
      if (!(await this.prompts.overwriteSdk(sdk))) {
        this.prompts.destinationDirNotEmpty();
        return ActionResult.cancelled();
      }
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
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

      const archive = await tempContext.save(response.value);
      const generated = await tempContext.unzip(archive);
      if (generated.isErr()) {
        this.prompts.sdkNotUnzipped(generated.error);
        return ActionResult.failed();
      }

      if (mergeBase !== undefined) {
        const mergePlan = await gitContext.merge(mergeBase, generated.value);
        if (mergePlan.isErr()) {
          this.prompts.customCodeFailed(mergePlan.error);
          return ActionResult.failed();
        }
        const plan = mergePlan.value;
        if (plan.hasConflicts() && !force && !canAsk) {
          this.prompts.conflictsNotAsked(sdk, plan.conflicts);
          return ActionResult.failed();
        }
        const choice: ConflictChoice = !plan.hasConflicts()
          ? 'asPlaced'
          : force
          ? 'generated'
          : await this.prompts.conflictChoice(sdk, plan.conflicts);
        if (choice === 'cancel') {
          this.prompts.runCancelled(sdk);
          return ActionResult.cancelled();
        }
        const landing = choice === 'asPlaced' ? plan : plan.taking(choice);
        const previous = await gitContext.keepPrevious(mergeBase);
        if (previous.isErr()) {
          this.prompts.customCodeFailed(previous.error);
          return ActionResult.failed();
        }
        const written = await gitContext.write(landing);
        if (written.isErr()) {
          this.prompts.sdkNotWritten(sdk, written.error);
          const restored = await gitContext.restore(previous.value, landing);
          if (restored.isErr()) {
            this.prompts.sdkNotRestored(sdk, previous.value, restored.error);
          } else {
            this.prompts.sdkRestored(sdk);
          }
          return ActionResult.failed();
        }
        const recorded = await gitContext.recordSnapshot(generated.value, language, stability);
        if (recorded.isErr()) {
          this.prompts.snapshotNotRecordedAfterMerge(recorded.error);
        }
        if (choice !== 'asPlaced') {
          this.prompts.conflictsResolved(sdk, choice, plan.conflictedPaths());
        }
        if (landing.isEmpty()) {
          this.prompts.sdkUnchanged(sdk);
        } else {
          this.prompts.sdkMerged(sdk, landing.files, landing.conflicts.length);
        }
        if (!landing.hasConflicts()) {
          return ActionResult.success();
        }
        const staged = await this.gitService.stageConflicts(sdk, landing.stages);
        if (staged.isErr()) {
          this.prompts.conflictsNotStaged(staged.error);
          this.prompts.conflictStepsByHand(sdk, landing.markedPaths(), landing.unmarkedPaths());
        } else {
          this.prompts.conflictSteps(sdk, landing.markedPaths(), landing.unmarkedPaths());
        }
        return ActionResult.actionRequired();
      }

      // The directory becomes a repository only once there is a generation to put in it, so a failed generation leaves none behind.
      if (shouldMakeRepository) {
        const initialised = await this.gitService.init(sdk);
        if (initialised.isErr()) {
          this.prompts.repositoryNotInitialised(sdk, initialised.error);
          return ActionResult.failed();
        }
      }
      const saved = await gitContext.save(generated.value);
      if (shouldMakeRepository) {
        this.prompts.repositoryInitialised(saved);
      } else if (isRecordingFirstTime) {
        this.prompts.repositoryFound(saved);
      } else if (shouldReplaceOldRecord) {
        this.prompts.recordedSdkReplaced(saved);
      }
      if (shouldRecord) {
        const recorded = await gitContext.recordSnapshot(generated.value, language, stability);
        if (recorded.isErr()) {
          this.prompts.snapshotNotRecorded(recorded.error);
        }
      }
      this.prompts.sdkGenerated(saved);
      // No repository keeps edits, none was asked for, and git is not what is missing: the steps make one.
      if (!shouldRecord && (gitVersion.isSupported() || !needsGit)) {
        this.prompts.gitInitSteps(saved);
      }
      return ActionResult.success();
    });
  };
}
