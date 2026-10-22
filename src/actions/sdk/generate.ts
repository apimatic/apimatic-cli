import { ok, ResultAsync } from 'neverthrow';
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
import { SdkGeneration } from '../../types/sdk/generation-record.js';
import { replacesDirectory } from '../../types/sdk/sdk-destination.js';
import { favouringGenerator, resolving } from '../../types/sdk/settlement.js';
import { terminal } from '../../utils/terminal-utils.js';

/**
 * One run of `sdk generate`, read top to bottom: every question and every message is here, and
 * nothing else speaks. What a state means lives in `src/types/sdk/`; the I/O in the contexts.
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

    // Decided before anything is uploaded, so a refused or declined run stops here. Markers left
    // by the last run are settled first, and the directory looked at again, once.
    let looked = await sdkContext.destination(generation);
    if (looked.isOk() && looked.value.kind === 'unresolved') {
      const { repository, paths } = looked.value;
      if (!canAsk) {
        this.prompts.conflictsUnresolved(paths, repository.sdkDirectory());
        return ActionResult.failed();
      }
      const choice = await this.prompts.unresolvedChoice(paths, repository.sdkDirectory());
      if (choice === undefined || choice === 'resolve') {
        this.prompts.resolveLater();
        return ActionResult.failed();
      }
      const settled =
        choice === 'generated' ? await repository.resolveForGenerator(paths) : await repository.restorePrevious();
      if (settled.isErr()) {
        this.prompts.conflictsNotSettled(settled.error.reason);
        return ActionResult.failed();
      }
      if (choice === 'generated') {
        this.prompts.resolvedForGenerator(paths, repository.sdkDirectory());
      } else {
        this.prompts.previousRestored(repository.sdkDirectory());
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
        const generated = await repository.snapshotGenerated(tempSdk.value);
        const recorded = await generated.asyncAndThen(
          (tree) => new ResultAsync(repository.recordGeneration(tree, generation, envInfo.getCLIVersion(), []))
        );
        if (recorded.isErr()) {
          this.prompts.snapshotNotRecorded(recorded.error.reason);
        } else {
          const hook = await repository.installShareHook();
          if (hook.isErr()) {
            this.prompts.shareHookNotInstalled(hook.error.reason);
          } else if (hook.value.kind !== 'installed') {
            this.prompts.shareHookNeedsOneStep(hook.value);
          }
        }
        this.prompts.sdkGenerated(sdk);
        return ActionResult.success();
      }

      const { repository, base } = destination;
      const regenerated = await repository.regenerate(base, tempSdk.value);
      if (regenerated.isErr()) {
        this.prompts.customCodeFailed(regenerated.error.reason);
        return ActionResult.failed();
      }
      // Conflicts are settled before anything is written; a run that cannot ask leaves markers.
      let settlement = resolving(regenerated.value);
      if (settlement.plan.hasConflicts()) {
        const choice = canAsk ? await this.prompts.conflictChoice(settlement.plan, sdk) : 'resolve';
        if (choice === undefined || choice === 'keep') {
          this.prompts.sdkKept(sdk);
          return ActionResult.cancelled();
        }
        if (choice === 'generated') {
          const favoured = await repository.regenerate(base, tempSdk.value, 'generated');
          if (favoured.isErr()) {
            this.prompts.customCodeFailed(favoured.error.reason);
            return ActionResult.failed();
          }
          settlement = favouringGenerator(regenerated.value, favoured.value);
        }
      }
      const written = await repository.write(base, settlement.plan);
      if (written.isErr()) {
        this.prompts.customCodeFailed(written.error.reason);
        return ActionResult.failed();
      }
      const recorded = await repository.recordGeneration(
        settlement.regeneration.generated,
        generation,
        envInfo.getCLIVersion(),
        settlement.plan.conflictedPaths()
      );
      if (recorded.isErr()) {
        this.prompts.snapshotNotRecorded(recorded.error.reason);
      } else {
        const hook = await repository.installShareHook();
        if (hook.isErr()) {
          this.prompts.shareHookNotInstalled(hook.error.reason);
        } else if (hook.value.kind !== 'installed') {
          this.prompts.shareHookNeedsOneStep(hook.value);
        }
      }
      if (settlement.settledForGenerator.length > 0) {
        this.prompts.resolvedForGenerator(settlement.settledForGenerator, sdk);
      }
      this.prompts.sdkMerged(sdk, settlement.plan);
      if (!settlement.plan.hasConflicts()) {
        return ActionResult.success();
      }
      const staged = await repository.stageConflicts(settlement.regeneration.merge);
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
