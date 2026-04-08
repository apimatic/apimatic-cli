import { FileService } from "../infrastructure/file-service.js";
import { GitService } from "../infrastructure/git-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { Directory } from "./file/directory.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FileName } from "./file/fileName.js";
import { FilePath } from "./file/filePath.js";
import { Language } from "./sdk/generate.js";

export class SaveChangesContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();
  private readonly sdkInputDirectory: DirectoryPath;

  constructor(
    private readonly sourceTreePath: FilePath,
    private readonly sdkReviewDirectory: DirectoryPath,
    sdkInputDirectory: DirectoryPath | undefined,
    workingDirectory: DirectoryPath,
    language: Language,
    version: string | undefined
  ) {
    this.sdkInputDirectory = sdkInputDirectory ?? (version
        ? workingDirectory.join("sdk").join(version).join(language)
        : workingDirectory.join("sdk").join(language));
  }

  public async isSdkInputDirectoryMissing(onMissingDirectory: (directory: DirectoryPath) => void) {
    if (await this.fileService.directoryEmpty(this.sdkInputDirectory)) {
      onMissingDirectory(this.sdkInputDirectory);
      return true;
    }
    return false;
  }

  public async getChangesForReviewDirectory(): Promise<Directory> {
    const sdkGitDir = this.sdkReviewDirectory.join(".git");
    await this.fileService.createDirectoryIfNotExists(sdkGitDir);
    await this.zipService.unArchive(this.sourceTreePath, sdkGitDir);

    await this.gitService.checkoutCustomBranch(this.sdkReviewDirectory);
    await this.fileService.cleanDirectoryExcluding(this.sdkReviewDirectory, [new FileName(".git")]);
    await this.fileService.copyDirectoryExcluding(this.sdkInputDirectory, this.sdkReviewDirectory, [new FileName(".git")]);

    return this.gitService.getDirectoryWithUpdatedFiles(this.sdkReviewDirectory);
  }

  public async disposeSdkReviewDirectory(shouldRetry: (dir: DirectoryPath) => Promise<boolean>): Promise<boolean> {
    return this.fileService.forceDeleteDirectory(this.sdkReviewDirectory, () => shouldRetry(this.sdkReviewDirectory));
  }

  public async saveSourceTree(): Promise<void> {
    const sdkGitDir = this.sdkReviewDirectory.join(".git");
    await this.gitService.commitReviewedChanges(this.sdkReviewDirectory);
    await this.gitService.forceCheckoutMainBranch(this.sdkReviewDirectory);
    await this.zipService.archive(sdkGitDir, this.sourceTreePath);
  }
}
