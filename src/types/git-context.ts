import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitService } from '../infrastructure/git-service.js';
import { canonical } from '../infrastructure/tmp-extensions.js';
import { errorMessage } from '../utils/error-utils.js';
import { ValueMap } from './common/value-map.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { CommitId } from './git/commit-id.js';
import { GitVersion } from './git/git-version.js';
import { TreeEntry } from './git/tree-entry.js';
import { TreeId } from './git/tree-id.js';
import { Language, Stability } from './sdk/generate.js';
import { GenerationRecord, recordContents } from './sdk/generation-record.js';
import { lineEndingFor } from './sdk/file-content.js';
import { MergePlan } from './sdk/merge-plan.js';
import { WriteProblem } from './sdk/write-problem.js';

/** The ref holding each generation as the server returned it, chained, off every branch of the SDK directory's own repository. */
const PRISTINE_REF = 'refs/apimatic/pristine';

/** The ref holding the directory as it was before the last merge wrote, byte for byte, so that write can be undone. */
const PREVIOUS_REF = 'refs/apimatic/previous';

/** The sign that git has a say in the directory, a folder or a worktree's file, and the one entry a save keeps. */
const GIT_DIRECTORY = new FileName('.git');

/** Where the CLI keeps its record inside the SDK directory, and the file holding it. */
const RECORD_DIRECTORY = '.apimatic';
const RECORD_FILE = new FileName('generation.json');
const RECORD_PATH = `${RECORD_DIRECTORY}/${RECORD_FILE.toString()}`;

/** The SDK directory under git: what the disk and git answer about it, one question per method, and what a run does to it. */
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

  /** Whether a save would remove anything: hidden entries such as `.github` count, only `.git` stays. */
  public async hasFilesBesidesGit(): Promise<boolean> {
    return this.fileService.hasEntriesExcluding(this.directory, [GIT_DIRECTORY]);
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

  /** The record the last recording left; none without a file, or with one a CLI did not write. */
  public async generationRecord(): Promise<GenerationRecord> {
    const file = recordFile(this.directory);
    if (!(await this.fileService.fileExists(file))) {
      return GenerationRecord.none();
    }
    return GenerationRecord.parse(await this.fileService.getContents(file));
  }

  /** Whether the repository holds the snapshot a record names; false for none, with no git run. */
  public async hasSnapshot(commit: CommitId | undefined): Promise<Result<boolean, string>> {
    return commit === undefined ? ok(false) : this.gitService.hasCommit(this.directory, commit);
  }

  /** Replaces whatever the directory holds with the generated SDK, except its `.git`. */
  public async save(generated: DirectoryPath): Promise<DirectoryPath> {
    await this.fileService.cleanDirectoryExcluding(this.directory, [GIT_DIRECTORY]);
    await this.fileService.copyDirectoryContents(generated, this.directory);
    return this.directory;
  }

  /**
   * The fresh generation at `generated` merged over the directory as it is, against `base`, by git: what
   * to write, with its bytes, and remove, what conflicts, and what happened to every other file. Nothing is written.
   */
  public async merge(base: CommitId, generated: DirectoryPath): Promise<Result<MergePlan, string>> {
    const generatedTree = await this.gitService.treeOf(this.directory, generated);
    if (generatedTree.isErr()) {
      return err(generatedTree.error);
    }
    const baseTree = await this.gitService.treeOfCommit(this.directory, base);
    if (baseTree.isErr()) {
      return err(baseTree.error);
    }
    const baseEntries = await this.gitService.listTree(this.directory, baseTree.value);
    if (baseEntries.isErr()) {
      return err(baseEntries.error);
    }
    // Every path the base holds goes in, so a generated file an ignore rule matches is never taken for deleted.
    const basePaths = baseEntries.value.map((entry) => entry.path);
    const disk = await this.gitService.treeOfDirectory(this.directory, basePaths);
    if (disk.isErr()) {
      return err(disk.error);
    }
    // Yours is git's "ours" and the generation its "theirs", which is what the plan reads the stages by.
    const yours = await this.gitService.commitTree(this.directory, disk.value, base, 'apimatic: your changes');
    if (yours.isErr()) {
      return err(yours.error);
    }
    const theirs = await this.gitService.commitTree(this.directory, generatedTree.value, base, 'apimatic: generated');
    if (theirs.isErr()) {
      return err(theirs.error);
    }
    const merged = await this.gitService.mergeTree(this.directory, yours.value, theirs.value);
    if (merged.isErr()) {
      return err(merged.error);
    }
    const yourChanges = await this.gitService.diffTreesPairingRenames(this.directory, baseTree.value, disk.value);
    if (yourChanges.isErr()) {
      return err(yourChanges.error);
    }
    const generatedChanges = await this.gitService.diffTreesPairingRenames(
      this.directory,
      baseTree.value,
      generatedTree.value
    );
    if (generatedChanges.isErr()) {
      return err(generatedChanges.error);
    }
    const applied = await this.gitService.diffTrees(this.directory, disk.value, merged.value.tree);
    if (applied.isErr()) {
      return err(applied.error);
    }
    const changed = applied.value.flatMap((change) => (change.status === 'D' ? [] : [change]));
    const contents = await this.gitService.readBlobs(
      this.directory,
      changed.map((change) => change.blob)
    );
    if (contents.isErr()) {
      return err(contents.error);
    }
    return ok(
      MergePlan.from({
        merge: merged.value,
        // The CLI's own record is not an edit of yours.
        yours: yourChanges.value.filter((change) => change.path.toString() !== RECORD_PATH),
        generated: generatedChanges.value,
        writes: changed.map((change, index) => ({ path: change.path, content: contents.value[index] })),
        deletes: applied.value.flatMap((change) => (change.status === 'D' ? [change.path] : [])),
        basePaths
      })
    );
  }

  /**
   * Keeps the directory as it is, byte for byte, under the previous ref, replacing what the last run
   * kept, so a write can be undone; every path `base` holds goes in, ignore rules or not.
   */
  public async keepPrevious(base: CommitId): Promise<Result<CommitId, string>> {
    const baseEntries = await this.gitService.listTree(this.directory, base);
    if (baseEntries.isErr()) {
      return err(baseEntries.error);
    }
    const disk = await this.gitService.treeOfDirectoryAsIs(
      this.directory,
      baseEntries.value.map((entry) => entry.path)
    );
    if (disk.isErr()) {
      return err(disk.error);
    }
    const commit = await this.gitService.commitTree(
      this.directory,
      disk.value,
      undefined,
      'apimatic: before regeneration'
    );
    if (commit.isErr()) {
      return err(commit.error);
    }
    const moved = await this.gitService.updateRef(this.directory, PREVIOUS_REF, commit.value);
    return moved.map(() => commit.value);
  }

  /**
   * Lands the plan: removals before writes, so a name that changed only in case lands on a
   * filesystem that ignores case; each file with its own line ending, else the generator's, and
   * only when its bytes differ. A step that fails is named and nothing is undone, so the caller
   * can put the directory back from the snapshot it kept.
   */
  public async write(plan: MergePlan, generated: DirectoryPath): Promise<Result<void, WriteProblem>> {
    for (const path of plan.deletes) {
      try {
        await removeFile(this.fileService, path.in(this.directory), this.directory);
      } catch (error) {
        return err({ file: path, operation: 'remove', reason: errorMessage(error) });
      }
    }
    for (const write of plan.writes) {
      try {
        const file = write.path.in(this.directory);
        const sample = await firstOf(this.fileService, file, write.path.in(generated));
        await this.fileService.writeBytesIfChanged(file, lineEndingFor(write.content, sample));
      } catch (error) {
        return err({ file: write.path, operation: 'write', reason: errorMessage(error) });
      }
    }
    return ok(undefined);
  }

  /**
   * Puts every path the plan names back as `previous` holds it, in the plan's order, removing first
   * what it does not hold so a name that changed only in case comes back on a filesystem that
   * ignores case. A path the write had not reached is already as it was, so the undo need not know how far it got.
   */
  public async restore(previous: CommitId, plan: MergePlan): Promise<Result<void, string>> {
    const entries = await this.gitService.listTree(this.directory, previous);
    if (entries.isErr()) {
      return err(entries.error);
    }
    const kept = new ValueMap(entries.value.map((entry): [RelativeFilePath, TreeEntry] => [entry.path, entry]));
    const named = [...plan.deletes, ...plan.writes.map((write) => write.path)];
    const held = named.flatMap((path) => kept.get(path) ?? []);
    const contents = await this.gitService.readBlobs(
      this.directory,
      held.map((entry) => entry.oid)
    );
    if (contents.isErr()) {
      return err(contents.error);
    }
    try {
      for (const path of named.filter((path) => !kept.has(path))) {
        await removeFile(this.fileService, path.in(this.directory), this.directory);
      }
      for (const [index, entry] of held.entries()) {
        await this.fileService.writeBytesIfChanged(entry.path.in(this.directory), contents.value[index]);
      }
      return ok(undefined);
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  /**
   * Commits every file of `generated` under the pristine ref, chained onto the last snapshot, and
   * writes the record naming it, so the next run for the same generation has this one as its base.
   * An identical generation keeps the last snapshot.
   */
  public async recordSnapshot(
    generated: DirectoryPath,
    language: Language,
    stability: Stability
  ): Promise<Result<CommitId, string>> {
    const tree = await this.gitService.treeOf(this.directory, generated);
    if (tree.isErr()) {
      return err(tree.error);
    }
    const last = await this.gitService.resolveRef(this.directory, PRISTINE_REF);
    if (last.isErr()) {
      return err(last.error);
    }
    const snapshot = await snapshotOf(
      this.gitService,
      this.directory,
      tree.value,
      last.value,
      `apimatic: pristine ${language} ${stability}`
    );
    if (snapshot.isErr()) {
      return err(snapshot.error);
    }
    try {
      await this.fileService.replaceContents(
        recordFile(this.directory),
        recordContents(language, stability, snapshot.value)
      );
      return ok(snapshot.value);
    } catch (error) {
      return err(errorMessage(error));
    }
  }
}

function recordFile(directory: DirectoryPath): FilePath {
  return new FilePath(directory.join(RECORD_DIRECTORY), RECORD_FILE);
}

/** The bytes of the first of `files` that is there, for the line ending a written file follows; none when none is. */
async function firstOf(files: FileService, ...candidates: FilePath[]): Promise<Uint8Array | undefined> {
  for (const file of candidates) {
    if (await files.fileExists(file)) {
      return files.getBytes(file);
    }
  }
  return undefined;
}

/** Removes the file and the directories that leaves empty, below `within`. */
async function removeFile(files: FileService, file: FilePath, within: DirectoryPath): Promise<void> {
  await files.deleteFile(file);
  await files.removeEmptyDirectories(file.directory(), within);
}

/** `last` when it already holds `tree`, else a commit of `tree` on `last` with `message`, which the pristine ref is moved to. */
async function snapshotOf(
  git: GitService,
  root: DirectoryPath,
  tree: TreeId,
  last: CommitId | undefined,
  message: string
): Promise<Result<CommitId, string>> {
  if (last !== undefined) {
    const lastTree = await git.treeOfCommit(root, last);
    if (lastTree.isErr()) {
      return err(lastTree.error);
    }
    if (lastTree.value.isEqual(tree)) {
      return ok(last);
    }
  }
  const commit = await git.commitTree(root, tree, last, message);
  if (commit.isErr()) {
    return err(commit.error);
  }
  return (await git.updateRef(root, PRISTINE_REF, commit.value)).map(() => commit.value);
}
