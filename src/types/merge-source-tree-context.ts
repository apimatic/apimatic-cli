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
    await this.fileService.cleanDirectory(this.sdkWithoutSourceTree);
    await this.fileService.copyDirectoryExcluding(this.sdkWithSourceTree, this.sdkWithoutSourceTree, [new FileName(".git")]);
    return { hasSkippedChangesEnabled: true, hasSkippedCustomizations: true };
  }

  public async saveWithoutConflicts(): Promise<{ hasSourceTreeTracked: boolean, hasSourceTreeAlreadyTracked: boolean, hasAppliedCustomizations: boolean }> {
    const mergeFiles = this.gitService.getMergeFiles(this.sdkWithSourceTree);
    if (await this.fileService.fileExists(mergeFiles[0])) {
      for (const filePath of mergeFiles) {
        await this.fileService.deleteFile(filePath);
      }
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

    // Re create the sdkWithoutSourceTree using the updated resolved state of the sdkWithSourceTree
    await this.fileService.cleanDirectory(this.sdkWithoutSourceTree);
    await this.fileService.copyDirectoryExcluding(this.sdkWithSourceTree, this.sdkWithoutSourceTree, [new FileName(".git")]);
    await this.saveSourceTree();
  }

  private async saveSourceTree(): Promise<void> {
    await this.fileService.ensurePathExists(this.sourceTreePath);
    await this.gitService.forceCheckoutMainBranch(this.sdkWithSourceTree);
    await this.zipService.archive(this.sdkWithSourceTree.join(".git"), this.sourceTreePath);
  }

  public async getConflictedFilesDirectory(): Promise<Directory> {
    return await this.gitService.getDirectoryWithUnmergedFiles(this.sdkWithSourceTree);
  }

  public async cleanUp(onCleanUpFailure: () => Promise<void>): Promise<void> {
    await this.fileService.pollDeleteDirectory(this.sdkWithSourceTree, onCleanUpFailure);
  }
}
