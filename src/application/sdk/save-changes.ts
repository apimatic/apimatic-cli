import { FileService } from "../../infrastructure/file-service.js";
import { GitFileStatus, GitService } from "../../infrastructure/git-service.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";

export class SaveChanges {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();

  public async prepareUpdatedSdkDirectory(
    sdk: DirectoryPath,
    sourceTreePath: FilePath,
    tempDirectory: DirectoryPath
  ): Promise<DirectoryPath> {
    const updatedSdkDirectory = tempDirectory.join("updated");
    const sdkGitDir = updatedSdkDirectory.join(".git");
    await this.fileService.createDirectoryIfNotExists(sdkGitDir);
    await this.zipService.unArchive(sourceTreePath, sdkGitDir);
    await this.gitService.checkoutCustomBranch(updatedSdkDirectory);
    await this.fileService.cleanDirectoryExcluding(updatedSdkDirectory, [".git"]);
    await this.fileService.copyDirectoryExcluding(sdk, updatedSdkDirectory, [".git"]);
    return updatedSdkDirectory;
  }

  public async getChanges(updatedSdkDirectory: DirectoryPath): Promise<GitFileStatus[]> {
    return this.gitService.getGitFileStatuses(updatedSdkDirectory);
  }

  public async prepareBaseSdkDirectory(
    updatedSdkDirectory: DirectoryPath,
    tempDirectory: DirectoryPath
  ): Promise<DirectoryPath> {
    const baseSdkDirectory = tempDirectory.join("base");
    await this.fileService.createDirectoryIfNotExists(baseSdkDirectory);
    await this.fileService.copyDirectoryContents(updatedSdkDirectory, baseSdkDirectory);
    await this.gitService.hardReset(baseSdkDirectory);
    return baseSdkDirectory;
  }

  public async saveSourceTree(
    updatedSdkDirectory: DirectoryPath,
    sourceTreePath: FilePath
  ): Promise<void> {
    const sdkGitDir = updatedSdkDirectory.join(".git");
    await this.gitService.commitReviewedChanges(updatedSdkDirectory);
    await this.zipService.archive(sdkGitDir, sourceTreePath);
  }
}