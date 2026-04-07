import git from "isomorphic-git";
import fs from "fs";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FileName } from "../types/file/fileName.js";
import { FilePath } from "../types/file/filePath.js";

export type GitFileStatus = { fileName: FileName; status: "modified" | "added" | "deleted" };

const GIT_AUTHOR = { name: "APIMatic-bot", email: "developer@apimatic.io" } as const;
const CUSTOM_BRANCH = "custom-code";
const MAIN_BRANCH = "main";

export class GitService {
  public async checkoutCustomBranch(dirPath: DirectoryPath): Promise<void> {
    const dir = dirPath.toString();

    return await this.hasCustomBranch(dirPath)
      ? await git.checkout({ fs, dir, ref: CUSTOM_BRANCH})
      : await git.branch({ fs, dir, ref: CUSTOM_BRANCH });
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

  public async getGitFileStatuses(dirPath: DirectoryPath): Promise<GitFileStatus[]> {
    const statusMatrix = await git.statusMatrix({ fs, dir: dirPath.toString() });

    return statusMatrix
      .filter(([, headStatus, workdirStatus, stageStatus]) => headStatus !== workdirStatus || stageStatus === 3)
      .map(([relativeFilePath, headStatus, workdirStatus]) => {
        const fileName = new FileName(relativeFilePath);
        if (headStatus === 0) {
          return { fileName, status: "added" };
        }
        if (workdirStatus === 0) {
          return { fileName, status: "deleted" };
        }
        return { fileName, status: "modified" };
      });
  }

  private async stageAll(dir: DirectoryPath): Promise<void> {
    const statuses = await this.getGitFileStatuses(dir);
    await Promise.all(
      statuses.map(({ fileName, status }) => {
        if (status === "deleted") {
          return git.remove({ fs, dir: dir.toString(), filepath: fileName.toString() });
        }
        return git.add({ fs, dir: dir.toString(), filepath: fileName.toString() });
      })
    );
  }

  public async getUpdatedFiles(dir: DirectoryPath): Promise<FilePath[]> {
    const statuses = await this.getGitFileStatuses(dir);
    return statuses.filter(({status}) => status === "modified")
      .map(({ fileName }) => new FilePath(dir, fileName));
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
