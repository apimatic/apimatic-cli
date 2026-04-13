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
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath | undefined,
    language: Language,
    apiVersion?: string
  ): Promise<ActionResult> => {
    const rootBuildContext = new BuildContext(buildDirectory);
    if (!(await rootBuildContext.exists())) {
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
        return ActionResult.success();
      }

      this.prompts.modifiedFilesDetected(updatedFilesDirectory);

      if (!await this.prompts.confirmChanges()) {
        await saveChangesContext.saveSourceTree();
        this.prompts.changesSaved(sdkSourceTree);
        return ActionResult.success();
      }

      const nonDeletedFilesDirectory = await updatedFilesDirectory.mapFilesInDirectory(async (_, fileItem) => {
        if (fileItem.description === "# Deleted") {
          return undefined;
        }
        return fileItem;
      });

      this.prompts.openingDirectoryToReviewChanges();
      if (!await this.launcherService.openFolderInIdeWithWait(sdkReviewDirectory, nonDeletedFilesDirectory.getAllFiles())
        && !await this.prompts.reviewChangesManually(sdkReviewDirectory)) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }

      await saveChangesContext.saveSourceTree();
      this.prompts.changesSaved(sdkSourceTree);

      await saveChangesContext.cleanUpSdkReviewDirectory(() => this.prompts.directoryStillOpen(sdkReviewDirectory));

      return ActionResult.success();
    });
  };
}
