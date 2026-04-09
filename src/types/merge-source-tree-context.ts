import { FileService } from "../infrastructure/file-service.js";
import { GitService } from "../infrastructure/git-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { Directory } from "./file/directory.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FileName } from "./file/fileName.js";
import { FilePath } from "./file/filePath.js";

export class MergeSourceTreeContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();

  constructor(
    private readonly sdkWithSourceTree: DirectoryPath,
    private readonly sdkWithoutSourceTree: DirectoryPath,
    private readonly sourceTreePath: FilePath,
    private readonly trackChanges: boolean,
    private readonly skipChanges: boolean,
    private readonly hasSdkSourceTree: boolean
  ) { }

  public async saveSkippingChanges(): Promise<{ hasSkippedChangesEnabled: boolean, hasSkippedCustomizations: boolean }> {
    if (!this.skipChanges || !await this.gitService.hasCustomBranch(this.sdkWithSourceTree)) {
      return { hasSkippedChangesEnabled: this.skipChanges, hasSkippedCustomizations: false };
    }
    await Promise.all(this.gitService.getMergeFiles(this.sdkWithSourceTree).map((filePath) => this.fileService.deleteFile(filePath)));
    await this.gitService.forceCheckoutMainBranch(this.sdkWithSourceTree);
    await this.fileService.deleteDirectory(this.sdkWithSourceTree.join(".git"));
    return { hasSkippedChangesEnabled: true, hasSkippedCustomizations: true };
  }

  public async saveWithoutConflicts(): Promise<{ hasSourceTreeTracked: boolean, hasSourceTreeAlreadyTracked: boolean, hasAppliedCustomizations: boolean }> {
    if (await this.fileService.fileExists(this.gitService.getMergeFiles(this.sdkWithSourceTree)[0])) {
      return { hasSourceTreeTracked: false, hasSourceTreeAlreadyTracked: false, hasAppliedCustomizations: false };
    }

    if (this.trackChanges || this.hasSdkSourceTree) {
      await this.saveSourceTree();
    }

    return {
      hasSourceTreeTracked: this.trackChanges || this.hasSdkSourceTree,
      hasSourceTreeAlreadyTracked: this.trackChanges && this.hasSdkSourceTree,
      hasAppliedCustomizations: await this.gitService.hasCustomBranch(this.sdkWithSourceTree)
    };
  }

  public async saveWithResolvedConflicts(): Promise<void> {
    await this.gitService.commitResolvedConflicts(this.sdkWithSourceTree);
    for (const filePath of this.gitService.getMergeFiles(this.sdkWithSourceTree)) {
      await this.fileService.deleteFile(filePath);
    }
    await this.saveSourceTree();

    // Re create the sdkWithoutSourceTree using the updated resolved state of the sdkWithSourceTree
    await this.fileService.cleanDirectory(this.sdkWithoutSourceTree);
    await this.fileService.copyDirectoryExcluding(this.sdkWithSourceTree, this.sdkWithoutSourceTree, [new FileName(".git")]);
  }

  private async saveSourceTree(): Promise<void> {
    await this.fileService.ensurePathExists(this.sourceTreePath);
    await this.gitService.forceCheckoutMainBranch(this.sdkWithSourceTree);
    await this.zipService.archive(this.sdkWithSourceTree.join(".git"), this.sourceTreePath);
  }

  public async getConflictedFilesDirectory(): Promise<Directory> {
    const updatedFilesDirectory = await this.gitService.getDirectoryWithUpdatedFiles(this.sdkWithSourceTree);
    const conflictMarker = this.gitService.getConflictMarker();
    return updatedFilesDirectory.mapFilesInDirectory(async (directoryPath, fileItem) => {
      if (await this.fileService.hasContent(new FilePath(directoryPath, fileItem.fileName), conflictMarker)) {
        return { fileName: fileItem.fileName, description: "# Conflicted file" };
      }
      return undefined;
    });
  }

  public async cleanUpWhenReady(showPrompt: () => Promise<void>): Promise<void> {
    await this.fileService.pollDeleteDirectory(this.sdkWithSourceTree, showPrompt);
  }
}
