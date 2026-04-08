import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { SdkInputContext } from "../../types/sdk-input-context.js";
import { BuildContext } from "../../types/build-context.js";
import { FilePath } from "../../types/file/filePath.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly launcherService = new LauncherService();

  public readonly execute = async (
    workingDirectory: DirectoryPath,
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath | undefined,
    language: Language,
    skipReview: boolean,
    apiVersion?: string
  ): Promise<ActionResult> => {
    const rootBuildContext = new BuildContext(buildDirectory);
    if (!(await rootBuildContext.validate())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
      return ActionResult.failed();
    }

    const versionedContextGetter = async () => {
      if (!await rootBuildContext.isVersionedBuild()) {
        if (apiVersion) this.prompts.apiVersionOnlyApplicableWithVersionedBuild();
        return { version: undefined, buildContext: rootBuildContext };
      }

      const versionedBuildDirectory = await rootBuildContext.getVersionedBuildDirectory();
      if (!versionedBuildDirectory) {
        this.prompts.invalidVersionedDocsDirectory(buildDirectory);
        return ActionResult.failed();
      }

      const singleVersionedBuildDirectory = await rootBuildContext.getSingleVersionedBuildDirectory();
      if (!apiVersion && singleVersionedBuildDirectory) {
        return {
          version: singleVersionedBuildDirectory.leafName(),
          buildContext: new BuildContext(singleVersionedBuildDirectory)
        };
      }

      const selectedVersionedBuildDirectory = await rootBuildContext.getSelectedVersionedBuildDirectory(
        apiVersion ? async () => apiVersion : this.prompts.selectVersion
      );
      if (!selectedVersionedBuildDirectory) {
        this.prompts.versionNotFound();
        return ActionResult.failed();
      }

      return {
        version: selectedVersionedBuildDirectory.leafName(),
        buildContext: new BuildContext(selectedVersionedBuildDirectory)
      };
    };
    
    const versionedContext = await versionedContextGetter();
    if (versionedContext instanceof ActionResult) {
      return versionedContext;
    }

    if (!(await versionedContext.buildContext.hasSdkSourceTree(language))) {
      this.prompts.sdkSourceTreeNotFound(language, workingDirectory);
      return ActionResult.failed();
    }

    const sdkContext = new SdkInputContext(sdkDirectory, workingDirectory, language, versionedContext.version);
    const sdkInputDirectory = sdkContext.getSdkInputDirectory();
    if (!(await sdkContext.exists())) {
      this.prompts.invalidSdkDirectory(sdkInputDirectory);
      return ActionResult.failed();
    }
    
    if (buildDirectory.isEqual(sdkInputDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    return await withDirPath(async (tempDirectory) => {
      const sourceTreePath = versionedContext.buildContext.getSdkSourceTree(language);
      const updatedStateDirectory = await sdkContext.prepareUpdatedSdkDirectory(
        sourceTreePath,
        tempDirectory
      );

      const fileStatuses = await sdkContext.getChanges(updatedStateDirectory);
      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }

      this.prompts.modifiedFilesDetected(fileStatuses.length, sdkInputDirectory.toTreeNode(
        fileStatuses.map(({ fileName, status }) => ({
          path: new FilePath(sdkInputDirectory, fileName),
          description: status === "modified" ? "# Modified" : status === "added" ? "# Added" : "# Deleted"
        }))
      ));

      if (skipReview) {
        if (!await this.prompts.confirmChanges()) {
          this.prompts.operationCancelled();
          return ActionResult.cancelled();
        }
        await sdkContext.saveSourceTree(updatedStateDirectory, sourceTreePath);
        this.prompts.changesSaved(sourceTreePath);
        return ActionResult.success();
      }

      const { diffPairs, standaloneFiles } = await sdkContext.classifyChangedFiles(
        updatedStateDirectory,
        tempDirectory,
        fileStatuses
      );

      const openedFiles = await this.launcherService.openFolderInIde(updatedStateDirectory, ...standaloneFiles);
      const opened = openedFiles && (await Promise.all(diffPairs.map(({ base, working }) =>
        this.launcherService.openDiffInIde(base, working)))).every(b => b);

      if (opened) {
        this.prompts.reviewInIdeAndClose();
        await this.launcherService.waitForVscodeToClose(updatedStateDirectory);
      } else if (!await this.prompts.reviewChangesManually(updatedStateDirectory)) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }

      await sdkContext.saveSourceTree(updatedStateDirectory, sourceTreePath);
      this.prompts.changesSaved(sourceTreePath);

      if (!await sdkContext.tryForceCleanUp(updatedStateDirectory, (dir) => this.prompts.directoryStillOpen(dir))) {
        this.prompts.operationCancelledMemoryLeak();
        return ActionResult.cancelled();
      }

      return ActionResult.success();
    });
  };
}
