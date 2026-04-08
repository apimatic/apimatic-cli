import git from "isomorphic-git";
import fs from "fs";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FileName } from "../types/file/fileName.js";
import { FilePath } from "../types/file/filePath.js";
import { Directory, FileItem } from "../types/file/directory.js";

export type GitFileStatus = { fileName: FileName; status: "modified" | "added" | "deleted" };

const GIT_AUTHOR = { name: "APIMatic-bot", email: "developer@apimatic.io" } as const;
const CUSTOM_BRANCH = "custom-code";
const MAIN_BRANCH = "main";

export class GitService {
  public async checkoutCustomBranch(dirPath: DirectoryPath): Promise<void> {
    const dir = dirPath.toString();

    if (!await this.hasCustomBranch(dirPath)) {
      await git.branch({ fs, dir, ref: CUSTOM_BRANCH });
    }

    await git.checkout({ fs, dir, ref: CUSTOM_BRANCH});
  }

  public async hasCustomBranch(dirPath: DirectoryPath): Promise<boolean> {
    const dir = dirPath.toString();
    const branches = await git.listBranches({ fs, dir });
    return branches.includes(CUSTOM_BRANCH);
  }

  public getMergeFiles(dirPath: DirectoryPath): FilePath[] {
    const gitDir = dirPath.join(".git");
    const mergeFiles = ["MERGE_HEAD", "MERGE_MODE", "MERGE_MSG"];
    return mergeFiles.map((filename) => new FilePath(gitDir, new FileName(filename)));
  }

  public async forceCheckoutMainBranch(dirPath: DirectoryPath): Promise<void> {
    await git.checkout({ fs, dir: dirPath.toString(), ref: MAIN_BRANCH, force: true });
  }

  public async hardReset(dir: DirectoryPath): Promise<void> {
    await git.checkout({ fs, dir: dir.toString(), force: true });
  }

  public async getDirectoryWithUpdatedFiles(dirPath: DirectoryPath): Promise<Directory> {
    const statusMatrix = await git.statusMatrix({ fs, dir: dirPath.toString() });

    const relativeUncommitedFiles = statusMatrix
      // include updated and resolved conflict files
      .filter(([, headStatus, workdirStatus, stageStatus]) => headStatus !== workdirStatus || stageStatus === 3)
      .map(([relativePath, workdirStatus, headStatus]) => {
        if (headStatus === 0) {
          return { relativePath, description: "# Added" };
        }
        if (workdirStatus === 0) {
          return { relativePath, description: "# Deleted" };
        }
        return { relativePath, description: "# Modified" };
      });

    type PendingDirectoryItem = FileItem | PendingDir;
    type PendingDir = { pendingDirPath: DirectoryPath; items: PendingDirectoryItem[] };

    const buildDirectory = (pending: PendingDir): Directory => new Directory(
      pending.pendingDirPath,
      pending.items.map((item) => ("pendingDirPath" in item ? buildDirectory(item) : item))
    );

    const root: PendingDir = { pendingDirPath: new DirectoryPath(this.toString()), items: [] };
    for (const file of relativeUncommitedFiles) {
      const parts = file.relativePath.split(/[\\/]/);
      let currentDir = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;

        if (isLastPart) {
          currentDir.items.push({ fileName: new FileName(part), description: file.description });
        } else {
          let existingDir = currentDir.items.find(
            (item) => "pendingDirPath" in item && item.pendingDirPath.leafName() === part
          ) as PendingDir | undefined;

          if (!existingDir) {
            existingDir = { pendingDirPath: currentDir.pendingDirPath.join(part), items: [] };
            currentDir.items.push(existingDir);
          }

          currentDir = existingDir;
        }
      }
    }

    return buildDirectory(root);
  }

  private async stageAll(dir: DirectoryPath): Promise<void> {
    const statusMatrix = await git.statusMatrix({ fs, dir: dir.toString() });
    await Promise.all(
      statusMatrix
        // include updated and resolved conflict files
        .filter(([, headStatus, workdirStatus, stageStatus]) => headStatus !== workdirStatus || stageStatus === 3)
        .map(([relativePath, workdirStatus]) => {
          if (workdirStatus === 0) {
            return git.remove({ fs, dir: dir.toString(), filepath: relativePath });
          }
          return git.add({ fs, dir: dir.toString(), filepath: relativePath });
        })
    );
  }

  public getConflictMarker(): string {
    return "<<<<<<< ";
  }

  public async commitResolvedConflicts(dir: DirectoryPath): Promise<void> {
    await this.stageAll(dir);
    await git.commit({ fs, dir: dir.toString(), message: "feat: resolve merge conflicts", author: GIT_AUTHOR });

    const headOid = await git.resolveRef({ fs, dir: dir.toString(), ref: "HEAD" });
    await git.writeRef({ fs, dir: dir.toString(), ref: `refs/heads/${MAIN_BRANCH}`, value: headOid, force: true });
    await git.writeRef({ fs, dir: dir.toString(), ref: `refs/heads/${CUSTOM_BRANCH}`, value: headOid, force: true });
  }

  public async commitReviewedChanges(dir: DirectoryPath): Promise<void> {
    await this.stageAll(dir);
    await git.commit({ fs, dir: dir.toString(), message: "feat: add customizations to generated SDK", author: GIT_AUTHOR });
  }
}
