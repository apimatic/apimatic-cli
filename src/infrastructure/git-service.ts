import git from "isomorphic-git";
import * as fsSync from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FilePath } from "../types/file/filePath.js";
import { FileService } from "./file-service.js";
import { ZipService } from "./zip-service.js";

export type FileStatus = { file: string; status: "modified" | "added" | "deleted" };

const GIT_AUTHOR = { name: "APIMatic-bot", email: "developer@apimatic.io" } as const;
const CUSTOM_BRANCH = "custom-code";
const MAIN_BRANCH = "main";

export class GitService {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  public async checkoutToCustomBranch(dir: string, force: boolean = false): Promise<void> {
    const branches = await git.listBranches({ fs: fsSync, dir });

    if (!branches.includes(CUSTOM_BRANCH)) {
      await git.branch({ fs: fsSync, dir, ref: CUSTOM_BRANCH });
    }

    await git.checkout({ fs: fsSync, dir, ref: CUSTOM_BRANCH, force });
  }

  public async checkoutToMain(dir: string, force: boolean = false): Promise<void> {
    await git.checkout({ fs: fsSync, dir, ref: MAIN_BRANCH, force });
  }

  public async getModifiedFilesWithStatus(dir: string): Promise<FileStatus[]> {
    const statusMatrix = await git.statusMatrix({ fs: fsSync, dir });

    return statusMatrix
      .filter(([, headStatus, workdirStatus]) => headStatus !== workdirStatus)
      .map(([filepath, headStatus, workdirStatus]) => {
        let status: "modified" | "added" | "deleted";
        if (headStatus === 0) {
          status = "added";
        } else if (workdirStatus === 0) {
          status = "deleted";
        } else {
          status = "modified";
        }
        return { file: filepath, status };
      });
  }

  public async normalizeLineEndings(dir: string, files: string[]): Promise<void> {
    await Promise.all(
      files.map(async (filepath) => {
        const fullPath = path.join(dir, filepath);
        try {
          const content = await fsPromises.readFile(fullPath, "utf8");
          const normalized = content.replace(/\r\n/g, "\n");
          await fsPromises.writeFile(fullPath, normalized, "utf8");
        } catch {
          // Skip binary files or files that can't be read as text
        }
      })
    );
  }

  public async stageFiles(dir: string, files: string[]): Promise<void> {
    await Promise.all(
      files.map(async (filepath) => {
        const fullPath = path.join(dir, filepath);
        return fsSync.existsSync(fullPath)
          ? git.add({ fs: fsSync, dir, filepath })
          : git.remove({ fs: fsSync, dir, filepath });
      })
    );
  }

  public async stageAll(dir: string): Promise<void> {
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

  public async commit(dir: string, message: string): Promise<void> {
    await git.commit({ fs: fsSync, dir, message, author: GIT_AUTHOR });
  }

  public detectMergeConflicts(dir: string): boolean {
    return fsSync.existsSync(path.join(dir, ".git", "MERGE_HEAD"));
  }

  public async getConflictedFiles(dir: string): Promise<string[]> {
    const matrix = await git.statusMatrix({ fs: fsSync, dir });
    const candidates = matrix
      .filter(([, , , stageStatus]) => stageStatus === 2 || stageStatus === 3)
      .map(([filepath]) => filepath);

    const conflicted: string[] = [];
    for (const filepath of candidates) {
      const fullPath = path.join(dir, filepath);
      if (fsSync.existsSync(fullPath)) {
        const content = fsSync.readFileSync(fullPath, "utf-8");
        if (content.includes("<<<<<<< ")) {
          conflicted.push(filepath);
        }
      }
    }
    return conflicted;
  }

  public async abortMergeAndCheckoutMain(dir: string): Promise<void> {
    this.cleanupMergeFiles(dir);
    await git.checkout({ fs: fsSync, dir, ref: MAIN_BRANCH, force: true });
  }

  public async commitResolvedConflicts(dir: string): Promise<void> {
    await this.stageAll(dir);
    await git.commit({ fs: fsSync, dir, message: "resolve conflicts", author: GIT_AUTHOR });
    this.cleanupMergeFiles(dir);
  }

  public cleanupMergeFiles(dir: string): void {
    const mergeFiles = ["MERGE_HEAD", "MERGE_MODE", "MERGE_MSG"];
    for (const file of mergeFiles) {
      const filePath = path.join(dir, ".git", file);
      if (fsSync.existsSync(filePath)) {
        fsSync.unlinkSync(filePath);
      }
    }
  }

  public setHeadToMain(dir: string): void {
    fsSync.writeFileSync(path.join(dir, ".git", "HEAD"), `ref: refs/heads/${MAIN_BRANCH}\n`);
  }

  public async saveSdkSourceTree(
    sdkDir: DirectoryPath,
    language: string,
    inputDirectory: DirectoryPath,
    trackChanges: boolean = false
  ): Promise<boolean> {
    const gitDir = sdkDir.join(".git");
    if (!(await this.fileService.directoryExists(gitDir))) return false;

    const sdkSourceTreeDir = inputDirectory.join("sdk-source-tree");
    const outputZipPath = FilePath.create(path.join(sdkSourceTreeDir.toString(), `.${language}`));
    const sourceTreeExists = outputZipPath && (await this.fileService.fileExists(outputZipPath));
    let saved = false;

    if (trackChanges || sourceTreeExists) {
      await this.fileService.createDirectoryIfNotExists(sdkSourceTreeDir);

      this.setHeadToMain(sdkDir.toString());

      if (outputZipPath) {
        await this.zipService.archive(gitDir, outputZipPath);
        saved = true;
      }
    }

    await this.fileService.deleteDirectory(gitDir);
    return saved;
  }
}
