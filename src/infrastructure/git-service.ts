import git from "isomorphic-git";
import fs from "fs";
import path from "path";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FilePath } from "../types/file/filePath.js";

export type GitFileStatus = { filePath: FilePath; status: "modified" | "added" | "deleted" };

const GIT_AUTHOR = { name: "APIMatic-bot", email: "developer@apimatic.io" } as const;
const CUSTOM_BRANCH = "custom-code";
const MAIN_BRANCH = "main";

export class GitService {
  public async checkoutCustomBranch(dirPath: DirectoryPath): Promise<void> {
    const dir = dirPath.toString();
    const branches = await git.listBranches({ fs, dir });

    if (!branches.includes(CUSTOM_BRANCH)) {
      await git.branch({ fs, dir, ref: CUSTOM_BRANCH });
    }

    await git.checkout({ fs, dir, ref: CUSTOM_BRANCH});
  }

  public async forceCheckoutMainBranch(dirPath: DirectoryPath): Promise<void> {
    this.cleanupMergeFiles(dirPath);
    await git.checkout({ fs, dir: dirPath.toString(), ref: MAIN_BRANCH, force: true });
  }

  public async hardReset(dir: DirectoryPath): Promise<void> {
    await git.checkout({ fs, dir: dir.toString(), force: true });
  }

  public async getGitFileStatuses(dirPath: DirectoryPath): Promise<GitFileStatus[]> {
    const statusMatrix = await git.statusMatrix({ fs, dir: dirPath.toString() });

    return statusMatrix
      .filter(([, headStatus, workdirStatus]) => headStatus !== workdirStatus)
      .map(([filepath, headStatus, workdirStatus]) => {
        const filePath = FilePath.createFromRelativePath(filepath)!;
        if (headStatus === 0) {
          return { filePath, status: "added" };
        }
        if (workdirStatus === 0) {
          return { filePath, status: "deleted" };
        }
        return { filePath, status: "modified" };
      });
  }

  public async stageAll(dir: DirectoryPath): Promise<void> {
    const statusMatrix = await git.statusMatrix({ fs, dir: dir.toString() });
    await Promise.all(
      statusMatrix
        .filter(([, , workdirStatus, stageStatus]) => workdirStatus !== stageStatus)
        .map(([filepath, , workdirStatus]) =>
          workdirStatus === 0
            ? git.remove({ fs, dir: dir.toString(), filepath })
            : git.add({ fs, dir: dir.toString(), filepath })
        )
    );
  }

  public detectMergeConflicts(dir: DirectoryPath): boolean {
    return fs.existsSync(path.join(dir.toString(), ".git", "MERGE_HEAD"));
  }

  public async getConflictedFiles(dir: DirectoryPath): Promise<string[]> {
    const matrix = await git.statusMatrix({ fs, dir: dir.toString() });
    const candidates = matrix
      .filter(([, , , stageStatus]) => stageStatus === 2 || stageStatus === 3)
      .map(([filepath]) => filepath);

    const conflicted: string[] = [];
    for (const filepath of candidates) {
      const fullPath = path.join(dir.toString(), filepath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes("<<<<<<< ")) {
          conflicted.push(filepath);
        }
      }
    }
    return conflicted;
  }

  public async commitResolvedConflicts(dir: DirectoryPath): Promise<void> {
    await this.stageAll(dir);
    await git.commit({ fs, dir: dir.toString(), message: "feat: resolve merge conflicts", author: GIT_AUTHOR });

    const headOid = await git.resolveRef({ fs, dir: dir.toString(), ref: "HEAD" });
    await git.writeRef({ fs, dir: dir.toString(), ref: `refs/heads/${MAIN_BRANCH}`, value: headOid, force: true });
    await git.writeRef({ fs, dir: dir.toString(), ref: `refs/heads/${CUSTOM_BRANCH}`, value: headOid, force: true });

    this.cleanupMergeFiles(dir);

    await git.checkout({ fs, dir: dir.toString(), ref: MAIN_BRANCH });
  }

  public async commitReviewedChanges(dir: DirectoryPath): Promise<void> {
    await this.stageAll(dir);
    await git.commit({ fs, dir: dir.toString(), message: "feat: add customizations to generated SDK", author: GIT_AUTHOR });
    await git.checkout({ fs, dir: dir.toString(), ref: MAIN_BRANCH });
  }

  public cleanupMergeFiles(dir: DirectoryPath): void {
    const mergeFiles = ["MERGE_HEAD", "MERGE_MODE", "MERGE_MSG"];
    for (const file of mergeFiles) {
      const filePath = path.join(dir.toString(), ".git", file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
