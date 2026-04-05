import { FileService } from "../infrastructure/file-service.js";
import { GitService } from "../infrastructure/git-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";

export class MergeSourceTreeContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();

  constructor(
    private readonly sdkDir: DirectoryPath,
    private readonly sourceTreePath: FilePath,
    private readonly trackChanges: boolean,
    private readonly skipChanges: boolean,
    private readonly hasSdkSourceTree: boolean
  ) {  }

  public async skipCustomizations(): Promise<{ hasSkippedChangesEnabled: boolean, hasSkippedCustomizations: boolean }> {
    if (!this.skipChanges || !await this.gitService.hasCustomBranch(this.sdkDir)) {
      return { hasSkippedChangesEnabled: this.skipChanges, hasSkippedCustomizations: false };
    }
    await Promise.all(this.gitService.getMergeFiles(this.sdkDir).map((filePath) => this.fileService.deleteFile(filePath)));
    await this.gitService.forceCheckoutMainBranch(this.sdkDir);
    await this.fileService.deleteDirectory(this.sdkDir.join(".git"));
    return { hasSkippedChangesEnabled: true, hasSkippedCustomizations: true };
  }

  public async saveNonConflictedSourceTree(): Promise<{ hasSourceTreeTracked: boolean, hasAppliedCustomizations: boolean }> {
    if (!(await this.fileService.fileExists(this.gitService.getMergeFiles(this.sdkDir).pop()!))) {
      return { hasSourceTreeTracked: false, hasAppliedCustomizations: false };
    }

    const shouldTrackChanges = this.trackChanges || this.hasSdkSourceTree;
    if (shouldTrackChanges) {
      await this.fileService.ensurePathExists(this.sourceTreePath);
      await this.zipService.archive(this.sdkDir.join(".git"), this.sourceTreePath);
    }
    const hasCustomizations = await this.gitService.hasCustomBranch(this.sdkDir);
    await this.fileService.deleteDirectory(this.sdkDir.join(".git"));
    return { hasSourceTreeTracked: shouldTrackChanges, hasAppliedCustomizations: hasCustomizations };
  }

  public async saveConflictedSourceTree(): Promise<void> {
    await this.gitService.commitResolvedConflicts(this.sdkDir);
    await Promise.all(this.gitService.getMergeFiles(this.sdkDir)
      .map((filePath) => this.fileService.deleteFile(filePath)));
    await this.zipService.archive(this.sdkDir.join(".git"), this.sourceTreePath);
    await this.fileService.deleteDirectory(this.sdkDir.join(".git"));
  }

  public async getConflicts(): Promise<FilePath[]> {
    return await this.fileService.filterFilesWithConflictMarkers(
      await this.gitService.getUpdatedFiles(this.sdkDir)
    );
  }
}
