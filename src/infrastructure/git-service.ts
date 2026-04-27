import git from "isomorphic-git";
import fs from "fs";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { FileName } from "../types/file/fileName.js";
import { FilePath } from "../types/file/filePath.js";
import { Directory } from "../types/file/directory.js";

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

  public async getDirectoryWithUpdatedFiles(dirPath: DirectoryPath): Promise<Directory> {
    const statusMatrix = await git.statusMatrix({ fs, dir: dirPath.toString() });

    const relativeUncommitedFiles = statusMatrix
      // include updated and resolved conflict files
      .filter(([, headStatus, workdirStatus, stageStatus]) => headStatus !== workdirStatus || stageStatus === 3)
      .map(([relativePath, workdirStatus, headStatus]) => {
        if (headStatus === 0) {
          return { fileName: new FileName(relativePath), description: "# Deleted" };
        }
        if (workdirStatus === 0) {
          return { fileName: new FileName(relativePath), description: "# Added" };
        }
        return { fileName: new FileName(relativePath), description: "# Modified" };
      });

    return Directory.createFromRelativePaths(dirPath, relativeUncommitedFiles);
  }

  private async stageAll(dir: DirectoryPath): Promise<void> {
    const statusMatrix = await git.statusMatrix({ fs, dir: dir.toString() });
    await Promise.all(
      statusMatrix
        // include updated and resolved conflict files
        .filter(([, headStatus, workdirStatus, stageStatus]) => headStatus !== workdirStatus || stageStatus === 3)
        .map(([relativePath, , workdirStatus]) => {
          if (workdirStatus === 0) {
            return git.remove({ fs, dir: dir.toString(), filepath: relativePath });
          }
          return git.add({ fs, dir: dir.toString(), filepath: relativePath });
        })
    );
  }

  public async getDirectoryWithUnmergedFiles(dir: DirectoryPath): Promise<Directory> {
    try {
      await git.merge({ fs, dir: dir.toString(), ours: CUSTOM_BRANCH, theirs: MAIN_BRANCH, author: GIT_AUTHOR });
      return new Directory(dir, []);
    } catch (error) {
      if (error instanceof git.Errors.UnmergedPathsError) {
        return Directory.createFromRelativePaths(dir, error.data.filepaths.map((filePath) => ({ fileName: new FileName(filePath), description: "# Conflicted file" })));
      }
      if (error instanceof git.Errors.MergeConflictError) {
        return new Directory(dir, []);
      }
      throw error;
    }
  }

  public async commitResolvedConflicts(dir: DirectoryPath): Promise<void> {
    await this.stageAll(dir);
    const headOid = await git.resolveRef({ fs, dir: dir.toString(), ref: "HEAD" });
    const mainOid = await git.resolveRef({ fs, dir: dir.toString(), ref: MAIN_BRANCH });
    await git.commit({
      fs,
      dir: dir.toString(),
      message: `Merge branch '${MAIN_BRANCH}' into ${CUSTOM_BRANCH}`,
      author: GIT_AUTHOR,
      parent: [headOid, mainOid],
    });
  }

  public async commitReviewedChanges(dir: DirectoryPath): Promise<void> {
    await this.stageAll(dir);
    await git.commit({ fs, dir: dir.toString(), message: "feat: add customizations to generated SDK", author: GIT_AUTHOR });
  }
}
