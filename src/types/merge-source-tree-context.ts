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
    private readonly hasSdkSourceTree: boolean
  ) {  }

  public async skipCustomizations(): Promise<void> {
    await Promise.all(this.gitService.getMergeFiles(this.sdkDir).map((filePath) => this.fileService.deleteFile(filePath)));
    await this.gitService.forceCheckoutMainBranch(this.sdkDir);
  }

  public async getConflicts(): Promise<FilePath[]> {
    return await this.fileService.filterFilesWithConflictMarkers(
      await this.gitService.getUpdatedFiles(this.sdkDir)
    );
  }

  public async saveNonConflictedSourceTree(): Promise<boolean> {
    if (!(await this.fileService.fileExists(this.gitService.getMergeFiles(this.sdkDir).pop()!))) {
      return false;
    }

    if (this.trackChanges || this.hasSdkSourceTree) {
      await this.fileService.ensurePathExists(this.sourceTreePath);
      await this.zipService.archive(this.sdkDir.join(".git"), this.sourceTreePath);
    }
    return true;
  }

  public async hasCustomizations(): Promise<boolean> {
    return await this.gitService.hasCustomBranch(this.sdkDir);
  }

  public async saveConflictedSourceTree(): Promise<void> {
    await this.gitService.commitResolvedConflicts(this.sdkDir);
    await Promise.all(this.gitService.getMergeFiles(this.sdkDir)
      .map((filePath) => this.fileService.deleteFile(filePath)));
    await this.zipService.archive(this.sdkDir.join(".git"), this.sourceTreePath);
  }

  public async cleanUp(): Promise<void> {
    await this.fileService.deleteDirectory(this.sdkDir.join(".git"));
  }
}
