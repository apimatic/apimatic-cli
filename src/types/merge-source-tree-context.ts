import { FileService } from "../infrastructure/file-service.js";
import { GitService } from "../infrastructure/git-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
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

  public async saveWithoutConflicts(): Promise<{ hasSourceTreeTracked: boolean, hasAppliedCustomizations: boolean }> {
    if (await this.fileService.fileExists(this.gitService.getMergeFiles(this.sdkWithSourceTree)[0])) {
      return { hasSourceTreeTracked: false, hasAppliedCustomizations: false };
    }

    const shouldTrackChanges = this.trackChanges || this.hasSdkSourceTree;
    if (shouldTrackChanges) {
      await this.saveSourceTree();
    }
    const hasCustomizations = await this.gitService.hasCustomBranch(this.sdkWithSourceTree);
    return { hasSourceTreeTracked: shouldTrackChanges, hasAppliedCustomizations: hasCustomizations };
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

  public async getConflicts(): Promise<FilePath[]> {
    return await this.fileService.filterFilesWithContent(
      await this.gitService.getUpdatedFiles(this.sdkWithSourceTree),
      this.gitService.getConflictMarker()
    );
  }

  public async tryForceCleanUp(shouldRetry: () => Promise<boolean>): Promise<boolean> {
    return this.fileService.forceDeleteDirectory(this.sdkWithSourceTree, shouldRetry);
  }
}
