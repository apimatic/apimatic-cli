import { FileService } from "../../infrastructure/file-service.js";
import { GitService } from "../../infrastructure/git-service.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";

export class MergeSourceTree {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();

  public async skipCustomizations(sdkDir: DirectoryPath): Promise<void> {
    await Promise.all(this.gitService.getMergeFiles(sdkDir).map((filePath) => this.fileService.deleteFile(filePath)));
    await this.gitService.forceCheckoutMainBranch(sdkDir);
    await this.fileService.deleteDirectory(sdkDir.join(".git"));
  }

  public async getConflicts(sdkDir: DirectoryPath): Promise<FilePath[]> {
    return await this.fileService.filterFilesWithConflictMarkers(
      await this.gitService.getUpdatedFiles(sdkDir)
    );
  }

  public async saveNonConflictedSourceTree(
    sdkDir: DirectoryPath,
    sourceTreePath: FilePath,
    shouldSaveSourceTree: boolean
  ): Promise<boolean> {
    if (!(await this.fileService.fileExists(this.gitService.getMergeFiles(sdkDir).pop()!))) {
      return false;
    }

    const gitDir = sdkDir.join(".git");
    if (shouldSaveSourceTree) {
      await this.fileService.ensurePathExists(sourceTreePath);
      await this.zipService.archive(gitDir, sourceTreePath);
    }
    await this.fileService.deleteDirectory(gitDir);
    return true;
  }

  public async commitConflictedSourceTree(sdkDir: DirectoryPath, sourceTreePath: FilePath): Promise<void> {
    await this.gitService.commitResolvedConflicts(sdkDir);
    await Promise.all(this.gitService.getMergeFiles(sdkDir)
      .map((filePath) => this.fileService.deleteFile(filePath)));
    const gitDir = sdkDir.join(".git");
    await this.zipService.archive(gitDir, sourceTreePath);
    await this.fileService.deleteDirectory(gitDir);
  }
}
