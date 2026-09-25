import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { SaveChangesContext } from "../../types/save-changes-context.js";
import { BuildContext } from "../../types/build-context.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly launcherService = new LauncherService();

  public readonly execute = async (
    workingDirectory: DirectoryPath,
    sourceDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath | undefined,
    language: Language,
    apiVersion?: string
  ): Promise<ActionResult> => {
    const rootBuildContext = new BuildContext(sourceDirectory);
    if (!(await rootBuildContext.exists())) {
      this.prompts.sourceDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }

    const versionedContextGetter = async () => {
      if (!await rootBuildContext.isVersionedBuild()) {
        if (apiVersion) this.prompts.apiVersionOnlyApplicableWithVersionedBuild();
        return { version: undefined, buildContext: rootBuildContext };
      }

      const versionedSourceDirectory = await rootBuildContext.getVersionedSourceDirectory();
      if (!versionedSourceDirectory) {
        this.prompts.invalidVersionedDocsDirectory(sourceDirectory);
        return ActionResult.failed();
      }

      const singleVersionedSourceDirectory = await rootBuildContext.getSingleVersionedSourceDirectory();
      if (!apiVersion && singleVersionedSourceDirectory) {
        return {
          version: singleVersionedSourceDirectory.leafName(),
          buildContext: new BuildContext(singleVersionedSourceDirectory)
        };
      }

      const selectedVersionedSourceDirectory = await rootBuildContext.getSelectedVersionedSourceDirectory(
        apiVersion ? async () => apiVersion : this.prompts.selectVersion
      );
      if (!selectedVersionedSourceDirectory) {
        this.prompts.versionNotFound();
        return ActionResult.failed();
      }

      return {
        version: selectedVersionedSourceDirectory.leafName(),
        buildContext: new BuildContext(selectedVersionedSourceDirectory)
      };
    };
    
    const versionedContext = await versionedContextGetter();
    if (versionedContext instanceof ActionResult) {
      return versionedContext;
    }

    if (!(await versionedContext.buildContext.hasSdkSourceTree(language))) {
      this.prompts.sdkSourceTreeNotFound(language);
      return ActionResult.failed();
    }

    return await withDirPath(async (tempDirectory) => {
      const sdkReviewDirectory = tempDirectory.join(language);
      const sdkSourceTree = versionedContext.buildContext.getSdkSourceTree(language);
      const saveChangesContext = new SaveChangesContext(
        sdkSourceTree,
        sdkReviewDirectory,
        sdkDirectory,
        workingDirectory,
        language,
        versionedContext.version
      );

      if (await saveChangesContext.isSdkInputDirectoryMissing(this.prompts.invalidSdkDirectory)) {
        return ActionResult.failed();
      }

      const updatedFilesDirectory = await saveChangesContext.getChangesForReviewDirectory();
      if (updatedFilesDirectory.isEmpty()) {
        this.prompts.noChangesDetected();
        return ActionResult.cancelled();
      }

      this.prompts.modifiedFilesDetected(updatedFilesDirectory);

      if (!await this.prompts.confirmReviewChanges()) {
        await saveChangesContext.saveSourceTree();
        this.prompts.changesSaved(sdkSourceTree);
        return ActionResult.success();
      }

      if (await this.launcherService.isIdeAvailable()) {
        this.prompts.openingDirectoryToReviewChanges();
        const nonDeletedFilesDirectory = await updatedFilesDirectory.mapFilesInDirectory(async (_, fileItem) => {
          return fileItem.description === "# Deleted" ? undefined : fileItem;
        });
        await this.launcherService.openFolderInIdeWithWait(sdkReviewDirectory, nonDeletedFilesDirectory.getAllFiles());
      } else {
        this.prompts.reviewChangesManually(sdkReviewDirectory);
      }

      if (await this.prompts.confirmSaveChanges()) {
        await saveChangesContext.saveSourceTree();
        this.prompts.changesSaved(sdkSourceTree);
        await saveChangesContext.cleanUpSdkReviewDirectory(() => this.prompts.directoryStillOpen(sdkReviewDirectory));
        return ActionResult.success();
      }
      
      this.prompts.operationCancelled();
      return ActionResult.cancelled();
    });
  };
}
