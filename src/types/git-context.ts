import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitService } from '../infrastructure/git-service.js';
import { canonical } from '../infrastructure/tmp-extensions.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { CommitId } from './git/commit-id.js';
import { GitVersion } from './git/git-version.js';

/** The ref holding each generation as the server returned it, chained, off every branch of the SDK directory's own repository. */
const PRISTINE_REF = 'refs/apimatic/pristine';

/** The sign that git has a say in the directory: a folder, or a worktree's file. */
const GIT_DIRECTORY = new FileName('.git');

/** Git on the SDK directory: what git answers about it, one question per method, and what it does to it. */
export class GitContext {
  private readonly gitService = new GitService();
  private readonly fileService = new FileService();

  constructor(private readonly directory: DirectoryPath) {}

  /** Whether the directory has a `.git` of its own, read from disk so no git is needed to know whether git will be. */
  public async hasGitDirectory(): Promise<boolean> {
    return (
      (await this.fileService.directoryExists(this.directory.join(GIT_DIRECTORY.toString()))) ||
      (await this.fileService.fileExists(new FilePath(this.directory, GIT_DIRECTORY)))
    );
  }

  /**
   * Whether the directory is a repository as `git` sees it: the root of its own, not inside one that
   * only encloses it, which is the developer's. False, with no git run, without a `.git` of its own
   * or a git that can serve, so a directory that is not there yet is fine.
   */
  public async isRepository(git: GitVersion): Promise<Result<boolean, string>> {
    if (!git.isSupported() || !(await this.hasGitDirectory())) {
      return ok(false);
    }
    // Spelt as git spells the root, so an 8.3 alias on Windows still compares equal.
    const real = new DirectoryPath(canonical(this.directory.toString()));
    const root = await this.gitService.topLevel(real);
    return root.map((found) => found !== undefined && found.isEqual(real));
  }

  /**
   * Commits every file of `generated` under the pristine ref, chained onto the last snapshot, so the
   * next run has this generation as its base. An identical generation keeps the last snapshot.
   */
  public async recordSnapshot(generated: DirectoryPath): Promise<Result<CommitId, string>> {
    const tree = await this.gitService.treeOf(this.directory, generated);
    if (tree.isErr()) {
      return err(tree.error);
    }
    const last = await this.gitService.resolveRef(this.directory, PRISTINE_REF);
    if (last.isErr()) {
      return err(last.error);
    }
    if (last.value !== undefined) {
      const lastTree = await this.gitService.treeOfCommit(this.directory, last.value);
      if (lastTree.isErr()) {
        return err(lastTree.error);
      }
      if (lastTree.value.isEqual(tree.value)) {
        return ok(last.value);
      }
    }
    const commit = await this.gitService.commitTree(this.directory, tree.value, last.value, 'apimatic: pristine');
    if (commit.isErr()) {
      return err(commit.error);
    }
    const moved = await this.gitService.updateRef(this.directory, PRISTINE_REF, commit.value);
    return moved.map(() => commit.value);
  }
}
