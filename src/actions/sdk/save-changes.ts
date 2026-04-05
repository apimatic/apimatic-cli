import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { ReviewChangesAction } from "./review-changes.js";
import { SdkInputContext } from "../../types/sdk-input-context.js";
import { SaveChanges } from "../../application/sdk/save-changes.js";
import { BuildContext } from "../../types/build-context.js";

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly reviewChanges = new ReviewChangesAction();
  private readonly saveChanges = new SaveChanges();

  public async execute(
    workingDirectory: DirectoryPath,
    buildDirectory: DirectoryPath,
    sdkDirectoryInput: string | undefined,
    language: Language,
    skipReview: boolean,
    apiVersion?: string
  ): Promise<ActionResult> {
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

    const sdkContext = new SdkInputContext(sdkDirectoryInput, workingDirectory, language, versionedContext.version);
    const sdkInputDirectory = sdkContext.getSdkInputDirectory();
    if (!(await sdkContext.exists())) {
      this.prompts.invalidSdkDirectory(sdkInputDirectory);
      return ActionResult.failed();
    }
    
    if (buildDirectory.isEqual(sdkInputDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    return withDirPath(async (tempDirectory) => {
      const sourceTreePath = versionedContext.buildContext.getSdkSourceTree(language);
      const updatedStateDirectory = await this.saveChanges.prepareUpdatedSdkDirectory(
        sdkInputDirectory,
        sourceTreePath,
        tempDirectory
      );

      const fileStatuses = await this.saveChanges.getChanges(updatedStateDirectory);
      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }
      this.prompts.modifiedFilesDetected(language, fileStatuses);

      if (skipReview) {
        if (!await this.prompts.confirmChanges()) {
          this.prompts.operationCancelled();
          return ActionResult.cancelled();
        }
        await this.saveChanges.saveSourceTree(updatedStateDirectory, sourceTreePath);
        this.prompts.changesSaved(sourceTreePath);
        return ActionResult.success();
      }

      const reviewResult = await this.reviewChanges.execute(
        updatedStateDirectory,
        await this.saveChanges.prepareBaseSdkDirectory(updatedStateDirectory, tempDirectory),
        fileStatuses
      );
      
      if (!reviewResult.isSuccess()) {
        return reviewResult;
      }

      await this.saveChanges.saveSourceTree(updatedStateDirectory, sourceTreePath);
      this.prompts.changesSaved(sourceTreePath);
      return ActionResult.success();
    });
  }
}
