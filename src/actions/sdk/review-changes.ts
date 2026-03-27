import { DirectoryPath } from "../../types/file/directoryPath.js";
import { Language } from "../../types/sdk/generate.js";
import { FileService } from "../../infrastructure/file-service.js";
import { GitService } from "../../infrastructure/git-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import * as path from "node:path";
import * as fsPromises from "node:fs/promises";

export type ReviewResult = { status: "confirmed" } | { status: "cancelled" };

export class ReviewChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly fileService = new FileService();
  private readonly gitService = new GitService();
  private readonly launcherService = new LauncherService();

  public async execute(
    sdkDir: DirectoryPath,
    updatedSdkDirectory: DirectoryPath,
    language: Language,
    fileStatuses: Array<{ file: string; status: "modified" | "added" | "deleted" }>,
    tempDirectory: DirectoryPath
  ): Promise<ReviewResult> {
    // Set up a review directory
    const reviewDir = path.join(tempDirectory.toString(), "review");
    const reviewDirPath = new DirectoryPath(reviewDir);
    const reviewGitDir = reviewDirPath.join(".git");
    await this.fileService.createDirectoryIfNotExists(reviewGitDir);
    await this.fileService.copyDirectoryContents(sdkDir.join(".git"), reviewGitDir);
    await this.gitService.checkoutToCustomBranch(reviewDir, true);

    // Classify each changed file as a diff pair, added file, or deleted file
    const diffPairs: Array<{ base: string; working: string }> = [];
    const standaloneFiles: string[] = [];
    for (const { file, status } of fileStatuses) {
      if (status === "added") {
        standaloneFiles.push(path.join(updatedSdkDirectory.toString(), file));
      } else if (status === "deleted") {
        const basePath = path.join(reviewDir, file);
        const { dir, name, ext } = path.parse(file);
        const deletedPath = path.join(reviewDir, dir, `${name} [deleted]${ext}`);
        await fsPromises.rename(basePath, deletedPath);
        standaloneFiles.push(deletedPath);
      } else {
        const basePath = path.join(reviewDir, file);
        const workingPath = path.join(updatedSdkDirectory.toString(), file);
        diffPairs.push({ base: basePath, working: workingPath });
      }
    }

    // Open diffs for review in the IDE, or fall back to manual review
    const opened = await this.launcherService.openDiffsInSourceControl(updatedSdkDirectory, diffPairs, standaloneFiles);
    if (opened) {
      this.prompts.reviewInIdeAndClose();
      await this.launcherService.waitForVscodeToClose(updatedSdkDirectory);
    } else {
      const confirmed = await this.prompts.reviewChangesManually(sdkDir);
      if (!confirmed) {
        this.prompts.operationCancelled();
        return { status: "cancelled" };
      }
    }

    return { status: "confirmed" };
  }
}
