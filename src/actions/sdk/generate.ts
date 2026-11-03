import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { ConflictChoice, SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { GitContext } from '../../types/git-context.js';
import { GitVersion } from '../../types/git/git-version.js';
import { GitService } from '../../infrastructure/git-service.js';
import { GenerationRecord } from '../../types/sdk/generation-record.js';

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
    const isRepository = await gitContext.isRepository(gitVersion);
    if (isRepository.isErr()) {
      this.prompts.repositoryNotInspected(sdk, isRepository.error);
      return ActionResult.failed();
    }
    const generationRecord = isRepository.value ? await gitContext.generationRecord() : GenerationRecord.none();
    const baseCommitId = generationRecord.baseFor(language, stability);
    const hasSnapshot = await gitContext.hasSnapshot(baseCommitId);
    if (hasSnapshot.isErr()) {
      this.prompts.repositoryNotInspected(sdk, hasSnapshot.error);
      return ActionResult.failed();
    }
    if (baseCommitId !== undefined && !hasSnapshot.value) {
      this.prompts.snapshotMissing(sdk);
    }
    // A base that is here is merged against; without one the SDK is written afresh.
    const mergeBaseCommitId = hasSnapshot.value ? baseCommitId : undefined;
    const shouldMakeRepository = gitVersion.isSupported() && gitInit && !isRepository.value;
    const shouldRecord = shouldMakeRepository || isRepository.value;
    const isRecordingFirstTime = isRepository.value && !generationRecord.isFound();
    const shouldReplaceOldRecord = force && generationRecord.isFound() && mergeBaseCommitId === undefined;

    // A merge writes only what changed, so it never asks; a save replaces everything, so it does.
    if (!force && mergeBaseCommitId === undefined && (await gitContext.hasFilesBesidesGit())) {
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

      if (mergeBaseCommitId !== undefined) {
        const mergePlan = await gitContext.merge(mergeBaseCommitId, generated.value);
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
        const previous = await gitContext.keepPrevious(mergeBaseCommitId);
        if (previous.isErr()) {
          this.prompts.customCodeFailed(previous.error);
          return ActionResult.failed();
        }
        const written = await gitContext.write(landing, generated.value);
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
          this.prompts.conflictsResolved(sdk, choice, plan.conflicts);
        }
        if (landing.isEmpty()) {
          this.prompts.sdkUnchanged(sdk);
        } else {
          this.prompts.sdkMerged(sdk, landing);
        }
        if (!landing.hasConflicts()) {
          return ActionResult.success();
        }
        const staged = await gitContext.stageConflicts(landing);
        if (staged.isErr()) {
          this.prompts.conflictsNotStaged(staged.error);
        }
        this.prompts.conflictSteps(sdk, landing, staged.isOk());
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
