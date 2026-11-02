import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { TempContext } from '../../types/temp-context.js';
import { isAvailableLanguage, Language, Stability } from '../../types/sdk/generate.js';
import { ProjectContext } from '../../types/project-context.js';
import { GitContext } from '../../types/git-context.js';
import { GitVersion } from '../../types/git/git-version.js';
import { SdkContext } from '../../types/sdk-context.js';
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
    const git = needsGit ? await this.gitService.version() : GitVersion.none();
    if (needsGit && !git.isFound()) {
      this.prompts.gitUnavailable();
    }
    if (git.isFound() && !git.isSupported()) {
      this.prompts.gitVersionNotSupported(git);
    }
    const repository = await gitContext.isRepository(git);
    if (repository.isErr()) {
      this.prompts.repositoryNotInspected(sdk, repository.error);
      return ActionResult.failed();
    }
    const records = git.isSupported() && (gitInit || repository.value);

    const sdkContext = new SdkContext(sdk);
    if (!force && (await sdkContext.exists())) {
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

      const saved = await sdkContext.save(generated.value);
      if (records) {
        const initialised = await this.gitService.init(saved);
        if (initialised.isErr()) {
          this.prompts.repositoryNotInitialised(saved, initialised.error);
        } else {
          this.prompts.repositoryInitialised(saved);
          const recorded = await gitContext.recordSnapshot(generated.value);
          if (recorded.isErr()) {
            this.prompts.snapshotNotRecorded(recorded.error);
          }
        }
      }
      this.prompts.sdkGenerated(saved);
      // No repository keeps edits, none was asked for, and git is not what is missing: the steps make one.
      if (!records && (git.isSupported() || !needsGit)) {
        this.prompts.gitInitSteps(saved);
      }
      return ActionResult.success();
    });
  };
}
