import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitService } from '../infrastructure/git-service.js';
import { errorMessage } from '../utils/error-utils.js';
import { DirectoryPath, posix } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { CommitId } from './git/commit-id.js';
import { StageEntry } from './git/merge-tree.js';
import { TreeId } from './git/tree-id.js';
import { hasConflictMarkers, relabelMarkers, resolveMarkersForGenerated } from './sdk/conflict-markers.js';
import { describeGeneration, GenerationRecord, SdkGeneration } from './sdk/generation-record.js';
import { MergePlan } from './sdk/merge-plan.js';
import { SHARE_HOOK_SCRIPT, SHARE_HOOK_SCRIPT_NAME, ShareHook } from './sdk/share-hook.js';
import { SnapshotRef } from './sdk/snapshot-ref.js';

export type SdkRepositoryProblem = { kind: 'gitFailed' | 'recordNotWritten' | 'hookNotWritten'; reason: string };

/**
 * Two SDK directories, one inside the other: refs are files, so only one of them can have
 * snapshots. `encloses` says the other one is the outer directory.
 */
export type NestedSdkDirectory = { kind: 'nestedSdkDirectory'; other: DirectoryPath; encloses: boolean };

/** Why a recorded snapshot is still absent after the one place it could have come from was tried. */
export type SnapshotFetch =
  | { kind: 'noRemote' }
  | { kind: 'absent'; remote: string }
  | { kind: 'failed'; remote: string; reason: string };

/** What the repository knows about its SDK directory before a run, from the record and the refs. */
export type SdkRepositoryState =
  | { kind: 'noRecord' }
  | { kind: 'otherGeneration'; recorded: SdkGeneration }
  | { kind: 'snapshotMissing'; fetch: SnapshotFetch }
  | { kind: 'unresolved'; paths: RelativeFilePath[] }
  | { kind: 'ready'; base: CommitId };

/**
 * The pre-push hook that shares snapshots runs the script, or the one line the developer has to
 * add to `file` so that it does: because git runs hooks from `hooksPath`, or because the hook
 * there is not a shell script the CLI can add to.
 */
export type ShareHookInstall =
  | { kind: 'installed'; file: FilePath }
  | { kind: 'elsewhere'; file: FilePath; hooksPath: string; script: FilePath }
  | { kind: 'notShell'; file: FilePath; shebang: string; script: FilePath };

/** The plan, the merged tree, and git's versions of every conflicted path, below the SDK directory. */
export type MergeOutcome = { plan: MergePlan; merged: TreeId; stages: StageEntry[] };

const RECORD_DIRECTORY = '.apimatic';
const RECORD_FILE = 'generation.json';

/**
 * An SDK directory together with the git repository that encloses it, where its snapshots live
 * as commits under hidden refs: the pristine chain (one commit per generation, the base of the
 * next merge) and the previous state (the directory before the last run wrote to it). It merges
 * a regeneration over the directory against that base. The repository is never pushed, fetched,
 * or checked out from here.
 */
export class SdkRepositoryContext {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  private constructor(private readonly rootDirectory: DirectoryPath, private readonly sdk: DirectoryPath) {}

  public static create(root: DirectoryPath, sdkDirectory: DirectoryPath): SdkRepositoryContext | undefined {
    return root.contains(sdkDirectory) ? new SdkRepositoryContext(root, sdkDirectory) : undefined;
  }

  public root(): DirectoryPath {
    return this.rootDirectory;
  }

  public sdkDirectory(): DirectoryPath {
    return this.sdk;
  }

  /** True when the SDK directory is the repository itself, so its `.git` sits among the SDK files. */
  public isRootSdk(): boolean {
    return this.rootDirectory.isEqual(this.sdk);
  }

  public pristineRef(): SnapshotRef {
    return SnapshotRef.pristine(this.sdkPath());
  }

  public previousRef(): SnapshotRef {
    return SnapshotRef.previous(this.sdkPath());
  }

  /** A path below the SDK directory as git names it from the repository root. */
  public rootRelative(relative: RelativeFilePath): RelativeFilePath {
    return relative.below(this.sdkPath());
  }

  /** The remote the SDK's snapshots are shared through: where the current branch pushes, else `origin`. */
  public async remote(): Promise<string | undefined> {
    return this.git.remoteOf(this.rootDirectory);
  }

  /**
   * Everything a run needs to know before it decides how to write; a nested SDK directory is
   * the one refusal. A recorded snapshot the repository lacks is fetched from `remote` first.
   */
  public async inspect(
    generation: SdkGeneration,
    remote: string | undefined
  ): Promise<Result<SdkRepositoryState, SdkRepositoryProblem | NestedSdkDirectory>> {
    const notNested = await this.verifyNotNested();
    if (notNested.isErr()) {
      return err(notNested.error);
    }
    const record = await this.readRecord();
    if (record === undefined) {
      return ok({ kind: 'noRecord' });
    }
    if (!record.isFor(generation)) {
      return ok({ kind: 'otherGeneration', recorded: record.generatedAs() });
    }
    const base = record.pristineCommit();
    if (!(await this.git.hasCommit(this.rootDirectory, base))) {
      if (remote === undefined) {
        return ok({ kind: 'snapshotMissing', fetch: { kind: 'noRemote' } });
      }
      const fetched = await this.fetchSnapshots(remote);
      if (fetched.isErr()) {
        return ok({ kind: 'snapshotMissing', fetch: { kind: 'failed', remote, reason: fetched.error.reason } });
      }
      if (!(await this.git.hasCommit(this.rootDirectory, base))) {
        return ok({ kind: 'snapshotMissing', fetch: { kind: 'absent', remote } });
      }
    }
    const paths = await this.unresolvedConflicts(record);
    return ok(paths.length > 0 ? { kind: 'unresolved', paths } : { kind: 'ready', base });
  }

  /**
   * Puts the block that shares snapshots into the repository's `pre-push` hook, where git runs
   * hooks from. The script itself always goes into git's own hooks directory, so that the one
   * line a hook elsewhere needs is the same everywhere. Idempotent: files are rewritten only
   * when their content differs, and a hook that already runs the script is left alone.
   */
  public async installShareHook(): Promise<Result<ShareHookInstall, SdkRepositoryProblem>> {
    try {
      const hooks = await this.git.hooksDirectory(this.rootDirectory);
      const script = new FilePath(hooks, new FileName(SHARE_HOOK_SCRIPT_NAME));
      await this.writeExecutable(script, SHARE_HOOK_SCRIPT);
      const hooksPath = await this.git.hooksPathConfigured(this.rootDirectory);
      if (hooksPath !== undefined) {
        const file = this.hookRunFrom(hooksPath);
        return ok(
          ShareHook.calls(await this.read(file))
            ? { kind: 'installed', file }
            : { kind: 'elsewhere', file, hooksPath, script }
        );
      }
      const file = new FilePath(hooks, new FileName('pre-push'));
      const existing = await this.read(file);
      const hook = ShareHook.installInto(existing);
      switch (hook.kind) {
        case 'present':
          return ok({ kind: 'installed', file });
        case 'notShell':
          return ok(
            ShareHook.calls(existing)
              ? { kind: 'installed', file }
              : { kind: 'notShell', file, shebang: hook.shebang, script }
          );
        case 'installed':
          await this.writeExecutable(file, hook.content);
          return ok({ kind: 'installed', file });
      }
    } catch (error) {
      return err({ kind: 'hookNotWritten', reason: errorMessage(error) });
    }
  }

  // The script a hooks directory elsewhere runs: husky v9's `.husky/_` runs `.husky/pre-push`; any other
  // `core.hooksPath` runs its own `pre-push`.
  private hookRunFrom(hooksPath: string): FilePath {
    const directory = this.rootDirectory.resolve(hooksPath);
    const scripts = path.basename(directory.toString()) === '_' ? directory.join('..') : directory;
    return new FilePath(scripts, new FileName('pre-push'));
  }

  private async read(file: FilePath): Promise<string | undefined> {
    return (await this.fileService.fileExists(file)) ? fs.promises.readFile(file.toString(), 'utf8') : undefined;
  }

  private async writeExecutable(file: FilePath, content: string): Promise<void> {
    if ((await this.read(file)) === content) {
      return;
    }
    await fs.promises.mkdir(file.directory().toString(), { recursive: true });
    await fs.promises.writeFile(file.toString(), content, 'utf8');
    await fs.promises.chmod(file.toString(), 0o755);
  }

  /** Puts the SDK directory back as it was before the last run, record included, and settles its conflicts in the index. */
  public async restorePrevious(): Promise<Result<void, SdkRepositoryProblem>> {
    try {
      const previous = await this.git.resolveRef(this.rootDirectory, this.previousRef());
      if (previous === undefined) {
        return err(gitFailed('there is no earlier state of the SDK directory to go back to'));
      }
      const conflicts = (await this.readRecord())?.conflictedPaths() ?? [];
      const tree = await this.git.treeOfCommit(this.rootDirectory, previous);
      await this.git.checkoutTree(this.rootDirectory, this.sdk, tree);
      await this.git.unstage(
        this.rootDirectory,
        conflicts.map((path) => this.rootRelative(path))
      );
      return ok(undefined);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /**
   * Settles the markers still in `paths` for the generator's side, keeping everything around
   * them (including what was already resolved by hand), and takes the files out of the
   * unmerged state in the index.
   */
  public async resolveForGenerator(paths: readonly RelativeFilePath[]): Promise<Result<void, SdkRepositoryProblem>> {
    try {
      for (const path of paths) {
        const file = path.in(this.sdk).toString();
        const content = await fs.promises.readFile(file, 'utf8');
        await fs.promises.writeFile(file, resolveMarkersForGenerated(content), 'utf8');
      }
      await this.git.unstage(
        this.rootDirectory,
        paths.map((path) => this.rootRelative(path))
      );
      return ok(undefined);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** A freshly generated SDK as a tree: every file, whatever its own `.gitignore` says. */
  public async snapshotGenerated(generated: DirectoryPath): Promise<Result<TreeId, SdkRepositoryProblem>> {
    try {
      return ok(await this.git.treeOf(this.rootDirectory, generated, 'all'));
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /**
   * The SDK directory as it is on disk: its `.gitignore` is honoured, except that every path
   * `base` holds goes in, so a generated file an ignore rule matches is never taken for deleted.
   */
  public async snapshotDisk(base: CommitId | undefined): Promise<Result<TreeId, SdkRepositoryProblem>> {
    try {
      const include =
        base === undefined ? [] : (await this.git.listTree(this.rootDirectory, base)).map((entry) => entry.path);
      return ok(await this.git.treeOf(this.rootDirectory, this.sdk, include));
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** Records `generated` as the next pristine snapshot, chained on the last one; an identical generation keeps the last. */
  public async recordPristine(
    generated: TreeId,
    generation: SdkGeneration
  ): Promise<Result<CommitId, SdkRepositoryProblem>> {
    const ref = this.pristineRef();
    try {
      const parent = await this.git.resolveRef(this.rootDirectory, ref);
      if (parent !== undefined && (await this.git.treeOfCommit(this.rootDirectory, parent)).isEqual(generated)) {
        return ok(parent);
      }
      const commit = await this.git.commitTree(
        this.rootDirectory,
        generated,
        parent === undefined ? [] : [parent],
        `apimatic: pristine ${describeGeneration(generation)}`
      );
      await this.git.updateRef(this.rootDirectory, ref, commit);
      return ok(commit);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** The pristine snapshot first, then the record naming it, so the two never disagree. */
  public async recordGeneration(
    generated: TreeId,
    generation: SdkGeneration,
    cliVersion: string,
    conflicts: readonly RelativeFilePath[]
  ): Promise<Result<GenerationRecord, SdkRepositoryProblem>> {
    const pristine = await this.recordPristine(generated, generation);
    if (pristine.isErr()) {
      return err(pristine.error);
    }
    const record = GenerationRecord.written(generation, pristine.value, new Date(), cliVersion, conflicts);
    return (await this.writeRecord(record)).map(() => record);
  }

  /** Keeps the SDK directory as it is on disk, replacing what the last run kept, so a merge can be undone. */
  public async savePrevious(base: CommitId | undefined): Promise<Result<CommitId, SdkRepositoryProblem>> {
    const disk = await this.snapshotDisk(base);
    if (disk.isErr()) {
      return err(disk.error);
    }
    try {
      const commit = await this.git.commitTree(this.rootDirectory, disk.value, [], 'apimatic: before regeneration');
      await this.git.updateRef(this.rootDirectory, this.previousRef(), commit);
      return ok(commit);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  public async readRecord(): Promise<GenerationRecord | undefined> {
    const file = this.recordFile();
    if (!(await this.fileService.fileExists(file))) {
      return undefined;
    }
    return GenerationRecord.parse(await this.fileService.getContents(file));
  }

  /**
   * The three-way merge, done by git: the disk and the fresh generation are committed on the
   * pristine base as temporary commits, `merge-tree` merges them, and the plan says which
   * paths differ between the disk and the result.
   */
  public async merge(
    base: CommitId,
    disk: TreeId,
    generated: TreeId,
    favour?: 'generated'
  ): Promise<Result<MergeOutcome, SdkRepositoryProblem>> {
    const root = this.rootDirectory;
    try {
      const baseTree = await this.git.treeOfCommit(root, base);
      const yours = await this.git.commitTree(root, disk, [base], 'apimatic: your changes');
      const theirs = await this.git.commitTree(root, generated, [base], 'apimatic: generated');
      const merge = await this.git.mergeTree(root, yours, theirs, favour === 'generated' ? 'theirs' : undefined);
      const yourChanges = (await this.git.diffTrees(root, baseTree, disk, true)).filter(
        (change) => !change.path.toString().startsWith(`${RECORD_DIRECTORY}/`)
      );
      const plan = MergePlan.from({
        merge,
        yours: yourChanges,
        generated: await this.git.diffTrees(root, baseTree, generated, true),
        applied: await this.git.diffTrees(root, disk, merge.tree, false),
        basePaths: (await this.git.listTree(root, baseTree)).map((entry) => entry.path)
      });
      return ok({ plan, merged: merge.tree, stages: merge.stages });
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** Writes and removes what the plan says, in the SDK directory, with the CLI's labels on any markers. */
  public async apply(plan: MergePlan): Promise<Result<void, SdkRepositoryProblem>> {
    try {
      const blobs = await this.git.readBlobs(this.rootDirectory, [...new Set(plan.writes.map((write) => write.blob))]);
      for (const write of plan.writes) {
        const content = blobs.get(write.blob)!;
        const target = write.path.in(this.sdk).toString();
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, plan.hasMarkers(write.path) ? relabelMarkers(content) : content);
      }
      for (const relative of plan.deletes) {
        await fs.promises.rm(relative.in(this.sdk).toString(), { force: true });
      }
      return ok(undefined);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  /** Marks the conflicted paths in the repository's index the way a merge would, so git's own tools take over. */
  public async stageConflicts(outcome: MergeOutcome): Promise<Result<void, SdkRepositoryProblem>> {
    try {
      await this.git.stageConflicts(
        this.rootDirectory,
        outcome.stages.map((entry) => ({ ...entry, path: this.rootRelative(entry.path) }))
      );
      return ok(undefined);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  // Brings the remote's chain in and makes the local ref reach it: moved onto it when the local
  // one is behind, left alone when ahead, and joined with a two-parent commit when the two have
  // diverged, so a later push is a fast-forward that keeps every machine's snapshots.
  private async fetchSnapshots(remote: string): Promise<Result<void, SdkRepositoryProblem>> {
    try {
      const ref = this.pristineRef();
      const remoteTip = await this.git.fetchRef(this.rootDirectory, remote, ref);
      if (remoteTip === undefined) {
        return ok(undefined);
      }
      const localTip = await this.git.resolveRef(this.rootDirectory, ref);
      if (localTip === undefined || (await this.git.isAncestor(this.rootDirectory, localTip, remoteTip))) {
        await this.git.updateRef(this.rootDirectory, ref, remoteTip);
      } else if (!(await this.git.isAncestor(this.rootDirectory, remoteTip, localTip))) {
        const tree = await this.git.treeOfCommit(this.rootDirectory, localTip);
        const joined = await this.git.commitTree(
          this.rootDirectory,
          tree,
          [localTip, remoteTip],
          'apimatic: pristine chains joined'
        );
        await this.git.updateRef(this.rootDirectory, ref, joined);
      }
      return ok(undefined);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  // The ref name is the SDK directory's path, so one SDK directory inside another cannot have its own.
  private async verifyNotNested(): Promise<Result<void, SdkRepositoryProblem | NestedSdkDirectory>> {
    const ref = this.pristineRef();
    try {
      const colliding = (await this.pristineRefsIn()).find((existing) => existing.collidesWith(ref));
      if (colliding === undefined) {
        return ok(undefined);
      }
      const other = this.rootDirectory.join(colliding.sdkPath());
      return err({ kind: 'nestedSdkDirectory', other, encloses: other.contains(this.sdk) });
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
  }

  private async writeRecord(record: GenerationRecord): Promise<Result<FilePath, SdkRepositoryProblem>> {
    const file = this.recordFile();
    try {
      await this.fileService.replaceContents(file, record.toJson());
      return ok(file);
    } catch (error) {
      return err({ kind: 'recordNotWritten', reason: errorMessage(error) });
    }
  }

  // The files the record lists as conflicted that still hold the markers, so a run never merges over them.
  private async unresolvedConflicts(record: GenerationRecord): Promise<RelativeFilePath[]> {
    const unresolved: RelativeFilePath[] = [];
    for (const relative of record.conflictedPaths()) {
      const file = relative.in(this.sdk);
      if ((await this.fileService.fileExists(file)) && hasConflictMarkers(await this.fileService.getContents(file))) {
        unresolved.push(relative);
      }
    }
    return unresolved;
  }

  private recordFile(): FilePath {
    return new FilePath(this.sdk.join(RECORD_DIRECTORY), new FileName(RECORD_FILE));
  }

  private async pristineRefsIn(): Promise<SnapshotRef[]> {
    const namespace = SnapshotRef.pristineNamespace();
    return (await this.git.listRefs(this.rootDirectory, namespace)).map((name) =>
      SnapshotRef.pristine(name === namespace ? '' : name.slice(namespace.length + 1))
    );
  }

  private sdkPath(): string {
    return posix(path.relative(this.rootDirectory.toString(), this.sdk.toString()));
  }
}

const gitFailed = (reason: string): SdkRepositoryProblem => ({ kind: 'gitFailed', reason });
