import { FileService } from "../infrastructure/file-service.js";
import { GitService } from "../infrastructure/git-service.js";
import { ZipService } from "../infrastructure/zip-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { Language } from "./sdk/generate.js";
import { SdkContext } from "./sdk-context.js";

export class MergeSourceTreeContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly gitService = new GitService();
  private readonly sdkContext: SdkContext;

  constructor(
    private readonly sdkDir: DirectoryPath,
    private readonly sourceTreePath: FilePath,
    private readonly trackChanges: boolean,
    private readonly skipChanges: boolean,
    private readonly hasSdkSourceTree: boolean,
    private readonly zipSdk: boolean,
    private readonly completedTask: (dir: DirectoryPath) => void,
    outputSdkDirectory: DirectoryPath,
    language: Language,
    version?: string
  ) {
    this.sdkContext = new SdkContext(outputSdkDirectory, language, skipChanges && hasSdkSourceTree, version);
  }

  public async saveSkippingChanges(): Promise<{ hasSkippedChangesEnabled: boolean, hasSkippedCustomizations: boolean }> {
    if (!this.skipChanges || !await this.gitService.hasCustomBranch(this.sdkDir)) {
      return { hasSkippedChangesEnabled: this.skipChanges, hasSkippedCustomizations: false };
    }
    await Promise.all(this.gitService.getMergeFiles(this.sdkDir).map((filePath) => this.fileService.deleteFile(filePath)));
    await this.gitService.forceCheckoutMainBranch(this.sdkDir);
    await this.fileService.deleteDirectory(this.sdkDir.join(".git"));
    this.completedTask(await this.sdkContext.save(this.sdkDir, this.zipSdk));
    return { hasSkippedChangesEnabled: true, hasSkippedCustomizations: true };
  }

  public async saveWithoutConflicts(): Promise<{ hasSourceTreeTracked: boolean, hasAppliedCustomizations: boolean }> {
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
    this.completedTask(await this.sdkContext.save(this.sdkDir, this.zipSdk));
    return { hasSourceTreeTracked: shouldTrackChanges, hasAppliedCustomizations: hasCustomizations };
  }

  public async saveWithResolvedConflicts(): Promise<void> {
    await this.gitService.commitResolvedConflicts(this.sdkDir);
    await Promise.all(this.gitService.getMergeFiles(this.sdkDir)
      .map((filePath) => this.fileService.deleteFile(filePath)));
    await this.zipService.archive(this.sdkDir.join(".git"), this.sourceTreePath);
    await this.fileService.deleteDirectory(this.sdkDir.join(".git"));
    this.completedTask(await this.sdkContext.save(this.sdkDir, this.zipSdk));
  }

  public async getConflicts(): Promise<FilePath[]> {
    return await this.fileService.filterFilesWithConflictMarkers(
      await this.gitService.getUpdatedFiles(this.sdkDir)
    );
  }

  public async tryForceCleanUp(shouldRetry: () => Promise<boolean>): Promise<boolean> {
    while (await this.fileService.deleteDirectory(this.sdkDir).then(() => false).catch(() => true)) {
      if (!(await shouldRetry())) {
        return false;
      }
    }
    return true;
  }
}
