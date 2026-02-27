import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { ActionResult } from "../action-result.js";
import { FileService } from "../../infrastructure/file-service.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { ResolveConflictsPrompts } from "../../prompts/sdk/resolve-conflicts.js";
import git from "isomorphic-git";
import * as fsSync from "fs";
import * as path from "path";

const GIT_AUTHOR = { name: "APIMatic CLI", email: "support@apimatic.io" } as const;
const MAIN_BRANCH = "main";

export class ResolveConflictsAction {
  private readonly prompts: ResolveConflictsPrompts = new ResolveConflictsPrompts();
  private readonly fileService: FileService = new FileService();
  private readonly launcherService: LauncherService = new LauncherService();
  private readonly zipService: ZipService = new ZipService();

  public readonly execute = async (
    sdkDir: DirectoryPath,
    language: string,
    inputDirectory: DirectoryPath,
    noCustomization: boolean
  ): Promise<ActionResult> => {
    const hasMergeConflicts = await this.detectMergeConflicts(sdkDir);

    if (hasMergeConflicts) {
      if (noCustomization) {
        await this.abortMergeAndCheckoutCustom(sdkDir);
        await this.saveSdkSourceTree(sdkDir, language, inputDirectory);
        return ActionResult.success();
      }

      const resolved = await this.handleConflicts(sdkDir, language, inputDirectory);
      return resolved ? ActionResult.success() : ActionResult.failed();
    }

    if (noCustomization) {
      await git.checkout({ fs: fsSync, dir: sdkDir.toString(), ref: MAIN_BRANCH, force: true });
    }

    await this.saveSdkSourceTree(sdkDir, language, inputDirectory);
    return ActionResult.success();
  };

  private readonly handleConflicts = async (
    sdkTempDir: DirectoryPath,
    language: string,
    inputDirectory: DirectoryPath
  ): Promise<boolean> => {
    const resolved = await this.handleConflictsInteractive(sdkTempDir, language);
    if (!resolved) return false;

    await this.commitResolvedConflicts(sdkTempDir);
    await this.saveSdkSourceTree(sdkTempDir, language, inputDirectory);

    return true;
  };

  public readonly handleConflictsInteractive = async (
    sdkTempDir: DirectoryPath,
    languageDisplayName: string
  ): Promise<boolean> => {
    const conflictedFilePaths = await this.getConflictedFiles(sdkTempDir);
    if (conflictedFilePaths.length === 0) {
      return true;
    }

    this.prompts.displayFileTree(languageDisplayName, conflictedFilePaths, []);

    const conflictFilesToOpen = (
      await Promise.all(
        conflictedFilePaths.map(async (conflictPath) => {
          const filePath = FilePath.create(sdkTempDir.join(conflictPath).toString());
          return filePath && (await this.fileService.fileExists(filePath)) ? filePath : null;
        })
      )
    ).filter((f): f is FilePath => f !== null);

    const opened =
      conflictFilesToOpen.length > 0
        ? await this.launcherService.openFolderInIde(sdkTempDir, conflictFilesToOpen)
        : false;

    if (!opened) {
      this.prompts.sdkOpenError(languageDisplayName);
      return false;
    }

    const resolved = await this.prompts.askIfConflictsResolved(languageDisplayName);
    if (!resolved) {
      return this.handleConflictsInteractive(sdkTempDir, languageDisplayName);
    }

    this.prompts.conflictsResolved(languageDisplayName);
    return true;
  };

  public readonly detectMergeConflicts = async (dir: DirectoryPath): Promise<boolean> => {
    return fsSync.existsSync(path.join(dir.toString(), ".git", "MERGE_HEAD"));
  };

  private readonly abortMergeAndCheckoutCustom = async (sdkDir: DirectoryPath): Promise<void> => {
    const dir = sdkDir.toString();
    this.cleanupMergeFiles(dir);
    await git.checkout({ fs: fsSync, dir, ref: MAIN_BRANCH, force: true });
  };

  public readonly getConflictedFiles = async (dir: DirectoryPath): Promise<string[]> => {
    const matrix = await git.statusMatrix({ fs: fsSync, dir: dir.toString() });
    const candidates = matrix
      .filter(([, , , stageStatus]) => stageStatus === 2 || stageStatus === 3)
      .map(([filepath]) => filepath);

    const conflicted: string[] = [];
    for (const filepath of candidates) {
      const fullPath = path.join(dir.toString(), filepath);
      if (fsSync.existsSync(fullPath)) {
        const content = fsSync.readFileSync(fullPath, "utf-8");
        if (/^<{7} /m.test(content)) {
          conflicted.push(filepath);
        }
      }
    }
    return conflicted;
  };

  private readonly commitResolvedConflicts = async (sdkTempDir: DirectoryPath): Promise<void> => {
    const dir = sdkTempDir.toString();
    await this.stageChanges(dir);
    await git.commit({ fs: fsSync, dir, message: "resolve conflicts", author: GIT_AUTHOR });
    this.cleanupMergeFiles(dir);
  };

  private cleanupMergeFiles(dir: string): void {
    const mergeFiles = ["MERGE_HEAD", "MERGE_MODE", "MERGE_MSG"];
    for (const file of mergeFiles) {
      const filePath = path.join(dir, ".git", file);
      if (fsSync.existsSync(filePath)) {
        fsSync.unlinkSync(filePath);
      }
    }
  }

  private async stageChanges(dir: string): Promise<void> {
    const statusMatrix = await git.statusMatrix({ fs: fsSync, dir });
    await Promise.all(
      statusMatrix
        .filter(([, , workdirStatus, stageStatus]) => workdirStatus !== stageStatus)
        .map(([filepath, , workdirStatus]) =>
          workdirStatus === 0
            ? git.remove({ fs: fsSync, dir, filepath })
            : git.add({ fs: fsSync, dir, filepath })
        )
    );
  }

  public readonly saveSdkSourceTree = async (
    sdkDir: DirectoryPath,
    language: string,
    inputDirectory: DirectoryPath
  ): Promise<void> => {
    const gitDir = sdkDir.join(".git");
    if (!(await this.fileService.directoryExists(gitDir))) return;

    const sdkSourceTreeDir = inputDirectory.join("sdk-source-tree");
    await this.fileService.createDirectoryIfNotExists(sdkSourceTreeDir);

    fsSync.writeFileSync(path.join(gitDir.toString(), "HEAD"), `ref: refs/heads/${MAIN_BRANCH}\n`);

    const outputZipPath = FilePath.create(path.join(sdkSourceTreeDir.toString(), `.${language}`));
    if (outputZipPath) {
      await this.zipService.archive(gitDir, outputZipPath, ".git");
    }
    await this.fileService.deleteDirectory(gitDir);
  };
}