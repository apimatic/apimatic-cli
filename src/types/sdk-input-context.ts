import { FileService } from "../infrastructure/file-service.js";
import { GitFileStatus, GitService } from "../infrastructure/git-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FileName } from "./file/fileName.js";
import { FilePath } from "./file/filePath.js";
import { Language } from "./sdk/generate.js";

export class SdkInputContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();

  constructor(
    private readonly sdkDirectory: DirectoryPath | undefined,
    private readonly workingDirectory: DirectoryPath,
    private readonly language: Language,
    private readonly version?: string
  ) {  }
  
  public getSdkInputDirectory(): DirectoryPath {
    if (this.sdkDirectory){
      return this.sdkDirectory;
    }

    const sdkDirectory = this.workingDirectory.join("sdk");

    if (this.version) {
      return sdkDirectory.join(this.version).join(this.language);
    }

    return sdkDirectory.join(this.language);
  }

  public async exists() {
    return !(await this.fileService.directoryEmpty(this.getSdkInputDirectory()));
  }

  public async prepareUpdatedSdkDirectory(
    sourceTreePath: FilePath,
    tempDirectory: DirectoryPath
  ): Promise<DirectoryPath> {
    const sdk = this.getSdkInputDirectory();
    const updatedSdkDirectory = tempDirectory.join("updated");
    const sdkGitDir = updatedSdkDirectory.join(".git");
    await this.fileService.createDirectoryIfNotExists(sdkGitDir);
    await this.zipService.unArchive(sourceTreePath, sdkGitDir);
    await this.gitService.checkoutCustomBranch(updatedSdkDirectory);
    await this.fileService.cleanDirectoryExcluding(updatedSdkDirectory, [new FileName(".git")]);
    await this.fileService.copyDirectoryExcluding(sdk, updatedSdkDirectory, [new FileName(".git")]);
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
    await this.gitService.forceCheckoutMainBranch(updatedSdkDirectory);
    await this.zipService.archive(sdkGitDir, sourceTreePath);
  }

  public async classifyChangedFiles(
    updatedSdkDirectory: DirectoryPath,
    tempDirectory: DirectoryPath,
    fileStatuses: Array<GitFileStatus>
  ): Promise<{ diffPairs: Array<{ base: FilePath; working: FilePath }>; standaloneFiles: FilePath[] }> {
    const diffPairs: Array<{ base: FilePath; working: FilePath }> = [];
    const standaloneFiles: FilePath[] = [];
    const baseStateDirectory = await this.prepareBaseSdkDirectory(updatedSdkDirectory, tempDirectory);

    for (const { fileName, status } of fileStatuses) {
      const originalFilePath = new FilePath(baseStateDirectory, fileName);
      if (status === "deleted") {
        const renamedFilePath = await this.fileService.postfixFileName(originalFilePath, " [deleted]");
        standaloneFiles.push(renamedFilePath);
        continue;
      }
      const workingFilePath = new FilePath(updatedSdkDirectory, fileName);
      if (status === "added") {
        standaloneFiles.push(workingFilePath);
      } else {
        await this.fileService.normalizeFileLineEndings(workingFilePath);
        diffPairs.push({ base: originalFilePath, working: workingFilePath });
      }
    }

    return { diffPairs, standaloneFiles };
  }

  public async tryForceCleanUp(updatedSdkDirectory: DirectoryPath, showPrompt: () => Promise<void>): Promise<void> {
    await this.fileService.pollDeleteDirectory(updatedSdkDirectory, showPrompt);
  }
}
