import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { err, Err, ok, okAsync, Result, ResultAsync, safeTry } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitOperation, GitProblem, GitService } from '../infrastructure/git-service.js';
import { errorMessage } from '../utils/error-utils.js';
import { DirectoryPath, posix } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { CommitId } from './git/commit-id.js';
import { StageEntry } from './git/merge-tree.js';
import { TreeId } from './git/tree-id.js';
import { relabelMarkers, settleMarkers } from './sdk/conflict-markers.js';
import { describeGeneration, GenerationRecord, RECORD_ATTRIBUTES, SdkGeneration } from './sdk/generation-record.js';
import { ConflictSide, FileWrite, MergePlan } from './sdk/merge-plan.js';
import { settledContent } from './sdk/unresolved-file.js';
import { SHARE_HOOK_SCRIPT, SHARE_HOOK_SCRIPT_NAME, ShareHook } from './sdk/share-hook.js';
import { SnapshotRef } from './sdk/snapshot-ref.js';

/**
 * A file the run could not write or remove. What it had changed before was put back from the
 * previous snapshot, unless that failed too; then the snapshot is there to restore from by hand.
 */
export type NotApplied = {
  kind: 'notApplied';
  file: FilePath;
  operation: 'write' | 'remove';
  reason: string;
  undo: { kind: 'done' } | { kind: 'failed'; reason: string; previous: SnapshotRef };
};

/** `gitFailed` is git's own words; `fileFailed` the file system's. */
export type SdkRepositoryProblem =
  | { kind: 'gitFailed' | 'fileFailed' | 'recordNotWritten' | 'hookNotWritten'; reason: string }
  | NotApplied;

/**
 * Two SDK directories, one inside the other: refs are files, so only one of them can have
 * snapshots. `encloses` says the other one is the outer directory.
 */
export type NestedSdkDirectory = { kind: 'nestedSdkDirectory'; other: DirectoryPath; encloses: boolean };

/** The repository is in the middle of a git operation of the developer's own, which a run must not merge over. */
export type OperationInProgress = { kind: 'operationInProgress'; operation: GitOperation; root: DirectoryPath };

/** Why a run could not find out how to write the SDK directory. */
export type InspectionProblem = SdkRepositoryProblem | NestedSdkDirectory | OperationInProgress;

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
 * The pre-push hook that shares snapshots runs the script (`written` when this run put the
 * call there), or the one line the developer has to add to `file` so that it does: because
 * git runs hooks from `hooksPath`, which is in the repository (`inRepository`) or, as
 * `~/.githooks`, the developer's own, or because the hook there is not a shell script the
 * CLI can add to.
 */
export type ShareHookInstall =
  | { kind: 'installed'; file: FilePath; written: boolean }
  | { kind: 'elsewhere'; file: FilePath; hooksPath: string; inRepository: boolean; script: FilePath }
  | { kind: 'notShell'; file: FilePath; shebang: string; script: FilePath };

/** The plan, the merged tree, and git's versions of every conflicted path, below the SDK directory. */
export type MergeOutcome = { plan: MergePlan; merged: TreeId; stages: StageEntry[] };

/** A fresh generation merged over the directory as it is: the snapshot it will be recorded as, and the merge. */
export type Regeneration = { generated: TreeId; merge: MergeOutcome };

export const RECORD_DIRECTORY = '.apimatic';
const RECORD_FILE = 'generation.json';
const RECORD_ATTRIBUTES_FILE = '.gitattributes';

export const gitFailed = (problem: GitProblem): SdkRepositoryProblem => ({ kind: 'gitFailed', reason: problem.reason });

const fileFailed = (error: unknown): SdkRepositoryProblem => ({ kind: 'fileFailed', reason: errorMessage(error) });

/** A file operation as a `Result`, so a failing one stops a chain with the file system's own words. */
const onDisk = <T>(work: Promise<T>): ResultAsync<T, SdkRepositoryProblem> => ResultAsync.fromPromise(work, fileFailed);

/** Steps a `yield*` can stop on: each answers with a problem the whole becomes. */
type Steps<T, E> = AsyncGenerator<Err<never, E>, Result<T, E>>;

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
  public remote(): ResultAsync<string | undefined, SdkRepositoryProblem> {
    return this.git.remoteOf(this.rootDirectory).mapErr(gitFailed);
  }

  /**
   * Everything a run needs to know before it decides how to write. Refused while the developer
   * is in the middle of a merge of their own, and for a nested SDK directory. Files the last
   * run left unmerged come first, whatever the record says, so no run writes over them. A
   * recorded snapshot the repository lacks is fetched from `remote` first.
   */
  public inspect(
    generation: SdkGeneration,
    remote: string | undefined
  ): ResultAsync<SdkRepositoryState, InspectionProblem> {
    return this.guarded<SdkRepositoryState, InspectionProblem>(async function* () {
      const root = this.rootDirectory;
      const operation = yield* this.git.operationInProgress(root).mapErr(gitFailed);
      if (operation !== undefined) {
        return err({ kind: 'operationInProgress', operation, root });
      }
      yield* this.verifyNotNested();
      const paths = yield* this.unresolvedConflicts();
      if (paths.length > 0) {
        return ok({ kind: 'unresolved', paths });
      }
      const record = yield* onDisk(this.readRecord());
      if (record === undefined) {
        return ok({ kind: 'noRecord' });
      }
      if (!record.isFor(generation)) {
        return ok({ kind: 'otherGeneration', recorded: record.generatedAs() });
      }
      const base = record.pristineCommit();
      if (yield* this.git.hasCommit(root, base).mapErr(gitFailed)) {
        return ok({ kind: 'ready', base });
      }
      if (remote === undefined) {
        return ok({ kind: 'snapshotMissing', fetch: { kind: 'noRemote' } });
      }
      const fetched = await this.fetchSnapshots(remote);
      if (fetched.isErr()) {
        return ok({ kind: 'snapshotMissing', fetch: { kind: 'failed', remote, reason: fetched.error.reason } });
      }
      const present = yield* this.git.hasCommit(root, base).mapErr(gitFailed);
      return ok(present ? { kind: 'ready', base } : { kind: 'snapshotMissing', fetch: { kind: 'absent', remote } });
    });
  }

  /**
   * Puts the block that shares snapshots into the repository's `pre-push` hook, where git runs
   * hooks from. The script itself always goes into git's own hooks directory, so that the one
   * line a hook elsewhere needs is the same everywhere. Idempotent: files are rewritten only
   * when their content differs, and a hook that already runs the script is left alone.
   */
  public installShareHook(): ResultAsync<ShareHookInstall, SdkRepositoryProblem> {
    return this.guarded<ShareHookInstall, SdkRepositoryProblem>(async function* () {
      const root = this.rootDirectory;
      const hooks = yield* this.git.hooksDirectory(root).mapErr(hookNotWritten);
      const script = new FilePath(hooks, new FileName(SHARE_HOOK_SCRIPT_NAME));
      yield* onDisk(this.writeExecutable(script, SHARE_HOOK_SCRIPT)).mapErr(hookNotWritten);
      const hooksPath = yield* this.git.hooksPathConfigured(root).mapErr(hookNotWritten);
      if (hooksPath !== undefined) {
        const file = hookRunFrom(yield* this.git.hooksRunFrom(root).mapErr(hookNotWritten));
        const inRepository = root.contains(file.directory());
        const calls = ShareHook.calls(yield* onDisk(this.read(file)).mapErr(hookNotWritten));
        return ok(
          calls
            ? { kind: 'installed', file, written: false }
            : { kind: 'elsewhere', file, hooksPath, inRepository, script }
        );
      }
      const file = new FilePath(hooks, new FileName('pre-push'));
      const existing = yield* onDisk(this.read(file)).mapErr(hookNotWritten);
      const hook = ShareHook.installInto(existing);
      switch (hook.kind) {
        case 'present':
          return ok({ kind: 'installed', file, written: false });
        case 'notShell':
          return ok(
            ShareHook.calls(existing)
              ? { kind: 'installed', file, written: false }
              : { kind: 'notShell', file, shebang: hook.shebang, script }
          );
        case 'installed':
          yield* onDisk(this.writeExecutable(file, hook.content)).mapErr(hookNotWritten);
          return ok({ kind: 'installed', file, written: true });
      }
    });
  }

  /**
   * Settles what is left of the conflicts in `paths` for `side`, from the two sides git kept in
   * the index and the files as they are now (`settledContent`), and takes the files out of the
   * unmerged state, so `git status` stops listing them as both modified.
   */
  public settleUnresolved(
    side: ConflictSide,
    paths: readonly RelativeFilePath[]
  ): ResultAsync<void, SdkRepositoryProblem> {
    return this.guarded<void, SdkRepositoryProblem>(async function* () {
      const root = this.rootDirectory;
      const stages = yield* this.git.unmergedStages(root, this.sdkPathspec()).mapErr(gitFailed);
      const blobs = yield* this.git.readBlobs(root, [...new Set(stages.map((entry) => entry.oid))]).mapErr(gitFailed);
      for (const path of paths) {
        const key = this.rootRelative(path).toString();
        const stage = (number: StageEntry['stage']) => {
          const entry = stages.find((candidate) => candidate.stage === number && candidate.path.toString() === key);
          return entry === undefined ? undefined : blobs.get(entry.oid);
        };
        const file = path.in(this.sdk);
        const disk = yield* onDisk(this.contentOf(file));
        const settled = settledContent(side, { disk, yours: stage(2), generated: stage(3) });
        if (settled === undefined) {
          yield* onDisk(fs.promises.rm(file.toString(), { force: true }));
        } else if (settled !== disk) {
          yield* onDisk(this.withLineEnding(settled, file).then((content) => this.put(file, content)));
        }
      }
      yield* this.git
        .unstage(
          root,
          paths.map((path) => this.rootRelative(path))
        )
        .mapErr(gitFailed);
      return ok(undefined);
    });
  }

  /** A freshly generated SDK as a tree: every file, whatever its own `.gitignore` says. */
  public snapshotGenerated(generated: DirectoryPath): ResultAsync<TreeId, SdkRepositoryProblem> {
    return this.git.treeOf(this.rootDirectory, generated, 'all').mapErr(gitFailed);
  }

  /**
   * The SDK directory as it is on disk: its `.gitignore` is honoured, except that every path
   * `base` holds goes in, so a generated file an ignore rule matches is never taken for deleted.
   */
  public snapshotDisk(
    base: CommitId | undefined,
    lineEndings: 'normalized' | 'asIs' = 'normalized'
  ): ResultAsync<TreeId, SdkRepositoryProblem> {
    const root = this.rootDirectory;
    const include =
      base === undefined
        ? okAsync<RelativeFilePath[], GitProblem>([])
        : this.git.listTree(root, base).map((entries) => entries.map((entry) => entry.path));
    return include.andThen((paths) => this.git.treeOf(root, this.sdk, paths, lineEndings)).mapErr(gitFailed);
  }

  /** Records `generated` as the next pristine snapshot, chained on the last one; an identical generation keeps the last. */
  public recordPristine(generated: TreeId, generation: SdkGeneration): ResultAsync<CommitId, SdkRepositoryProblem> {
    return this.guarded<CommitId, SdkRepositoryProblem>(async function* () {
      const root = this.rootDirectory;
      const ref = this.pristineRef();
      const parent = yield* this.git.resolveRef(root, ref).mapErr(gitFailed);
      if (parent !== undefined && (yield* this.git.treeOfCommit(root, parent).mapErr(gitFailed)).isEqual(generated)) {
        return ok(parent);
      }
      const commit = yield* this.git
        .commitTree(
          root,
          generated,
          parent === undefined ? [] : [parent],
          `apimatic: pristine ${describeGeneration(generation)}`
        )
        .mapErr(gitFailed);
      yield* this.git.updateRef(root, ref, commit).mapErr(gitFailed);
      return ok(commit);
    });
  }

  /** The pristine snapshot first, then the record naming it, so the two never disagree. */
  public recordGeneration(
    generated: TreeId,
    generation: SdkGeneration
  ): ResultAsync<GenerationRecord, SdkRepositoryProblem> {
    return this.recordPristine(generated, generation).andThen((pristine) => {
      const record = GenerationRecord.written(generation, pristine);
      return this.writeRecord(record).map(() => record);
    });
  }

  /** Keeps the SDK directory as it is on disk, byte for byte, replacing what the last run kept, so a merge can be undone. */
  public savePrevious(base: CommitId | undefined): ResultAsync<CommitId, SdkRepositoryProblem> {
    const root = this.rootDirectory;
    return this.snapshotDisk(base, 'asIs')
      .andThen((disk) => this.git.commitTree(root, disk, [], 'apimatic: before regeneration').mapErr(gitFailed))
      .andThen((commit) =>
        this.git
          .updateRef(root, this.previousRef(), commit)
          .mapErr(gitFailed)
          .map(() => commit)
      );
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
  public merge(base: CommitId, disk: TreeId, generated: TreeId): ResultAsync<MergeOutcome, SdkRepositoryProblem> {
    return this.guarded<MergeOutcome, SdkRepositoryProblem>(async function* () {
      const git = this.git;
      const root = this.rootDirectory;
      const baseTree = yield* git.treeOfCommit(root, base).mapErr(gitFailed);
      const yours = yield* git.commitTree(root, disk, [base], 'apimatic: your changes').mapErr(gitFailed);
      const theirs = yield* git.commitTree(root, generated, [base], 'apimatic: generated').mapErr(gitFailed);
      const merge = yield* git.mergeTree(root, yours, theirs).mapErr(gitFailed);
      const yourChanges = (yield* git.diffTrees(root, baseTree, disk, true).mapErr(gitFailed)).filter(
        (change) => !change.path.toString().startsWith(`${RECORD_DIRECTORY}/`)
      );
      const plan = MergePlan.from({
        merge,
        yours: yourChanges,
        generated: yield* git.diffTrees(root, baseTree, generated, true).mapErr(gitFailed),
        applied: yield* git.diffTrees(root, disk, merge.tree, false).mapErr(gitFailed),
        basePaths: (yield* git.listTree(root, baseTree).mapErr(gitFailed)).map((entry) => entry.path)
      });
      return ok({ plan, merged: merge.tree, stages: merge.stages });
    });
  }

  /**
   * The generation in `generated` merged over the directory against `base`, in one step: both
   * trees are snapshotted, then merged.
   */
  public regenerate(base: CommitId, generated: DirectoryPath): ResultAsync<Regeneration, SdkRepositoryProblem> {
    return this.snapshotGenerated(generated).andThen((generatedTree) =>
      this.snapshotDisk(base).andThen((disk) =>
        this.merge(base, disk, generatedTree).map((merge) => ({ generated: generatedTree, merge }))
      )
    );
  }

  /**
   * Keeps the directory as it is under the previous ref, then applies the plan, removals before
   * writes so a path renamed only in case lands on a filesystem that ignores case. A write or
   * removal that fails ends the run and puts back, from that ref, every path it had changed, so
   * the directory is as it was; the ref stays for a developer to restore from by hand.
   */
  public write(base: CommitId, plan: MergePlan, generated: DirectoryPath): ResultAsync<void, SdkRepositoryProblem> {
    return this.savePrevious(base).andThen((previous) =>
      this.git
        .readBlobs(this.rootDirectory, [...new Set(plan.writes.map((write) => write.blob))])
        .mapErr(gitFailed)
        .andThen((blobs) => new ResultAsync(this.apply(plan, previous, generated, blobs)))
    );
  }

  private async apply(
    plan: MergePlan,
    previous: CommitId,
    generated: DirectoryPath,
    blobs: Map<string, Uint8Array>
  ): Promise<Result<void, SdkRepositoryProblem>> {
    const steps: { path: RelativeFilePath; operation: NotApplied['operation']; run: () => Promise<void> }[] = [
      ...plan.deletes.map((path) => ({
        path,
        operation: 'remove' as const,
        run: () => this.remove(path.in(this.sdk))
      })),
      ...plan.writes.map((write) => ({
        path: write.path,
        operation: 'write' as const,
        run: async () => {
          const content = this.markersOf(plan, write, blobs.get(write.blob)!);
          const file = write.path.in(this.sdk);
          return this.put(file, await this.withLineEnding(content, file, write.path.in(generated)));
        }
      }))
    ];
    const touched: RelativeFilePath[] = [];
    for (const step of steps) {
      touched.push(step.path);
      // Each step is its own attempt: the one that fails is named, and the ones before it are undone.
      const done = await onDisk(step.run());
      if (done.isErr()) {
        return err({
          kind: 'notApplied',
          file: step.path.in(this.sdk),
          operation: step.operation,
          reason: done.error.reason,
          undo: await this.undo(previous, touched)
        });
      }
    }
    return ok(undefined);
  }

  private markersOf(plan: MergePlan, write: FileWrite, content: Uint8Array): Uint8Array {
    if (write.settle !== undefined) {
      const labelled = relabelMarkers(content);
      return settleMarkers(labelled, write.settle) ?? labelled;
    }
    return plan.hasMarkers(write.path) ? relabelMarkers(content) : content;
  }

  private async undo(previous: CommitId, touched: readonly RelativeFilePath[]): Promise<NotApplied['undo']> {
    const restored = await this.guarded<void, SdkRepositoryProblem>(async function* () {
      const root = this.rootDirectory;
      const kept = new Map(
        (yield* this.git.listTree(root, previous).mapErr(gitFailed)).map((entry) => [entry.path.toString(), entry.oid])
      );
      const oids = touched.flatMap((relative) => kept.get(relative.toString()) ?? []);
      const blobs = yield* this.git.readBlobs(root, [...new Set(oids)]).mapErr(gitFailed);
      for (const relative of touched) {
        const oid = kept.get(relative.toString());
        yield* onDisk(
          oid === undefined ? this.remove(relative.in(this.sdk)) : this.put(relative.in(this.sdk), blobs.get(oid)!)
        );
      }
      return ok(undefined);
    });
    return restored.match(
      () => ({ kind: 'done' }),
      (problem) => ({ kind: 'failed', reason: problem.reason, previous: this.previousRef() })
    );
  }

  /**
   * Trees hold LF, so a blob written to disk gets the line ending the file there uses, else
   * the generator's fresh copy of it, else LF. A blob with a CR of its own, or binary, is
   * written as it is.
   */
  private async withLineEnding(content: Uint8Array, file: FilePath, ...samples: FilePath[]): Promise<Uint8Array> {
    if (content.includes(0x0d) || content.subarray(0, 8000).includes(0)) {
      return content;
    }
    for (const sample of [file, ...samples]) {
      if (await this.fileService.fileExists(sample)) {
        const crlf = (await fs.promises.readFile(sample.toString())).includes('\r\n');
        const text = Buffer.from(content).toString('latin1');
        return crlf ? new Uint8Array(Buffer.from(text.replace(/\n/g, '\r\n'), 'latin1')) : content;
      }
    }
    return content;
  }

  private async contentOf(file: FilePath): Promise<Uint8Array | undefined> {
    return (await this.fileService.fileExists(file))
      ? new Uint8Array(await fs.promises.readFile(file.toString()))
      : undefined;
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
    await fs.promises.chmod(file.toString(), 0o700);
  }

  private async put(file: FilePath, content: Uint8Array): Promise<void> {
    const target = file.toString();
    if ((await this.fileService.fileExists(file)) && (await fs.promises.readFile(target)).equals(content)) {
      return;
    }
    await fs.promises.mkdir(file.directory().toString(), { recursive: true });
    await fs.promises.writeFile(target, content);
  }

  private async remove(file: FilePath): Promise<void> {
    await fs.promises.rm(file.toString(), { force: true });
    for (let directory = file.directory(); this.sdk.isAncestorOf(directory); directory = directory.join('..')) {
      try {
        await fs.promises.rmdir(directory.toString());
      } catch {
        return;
      }
    }
  }

  /** The files the SDK directory shares: those git tracks or would add, never the CLI's own record. */
  public filesToShare(): ResultAsync<RelativeFilePath[], SdkRepositoryProblem> {
    return this.git
      .filesToCommit(this.sdk)
      .mapErr(gitFailed)
      .map((files) => files.filter((file) => file.inside(RECORD_DIRECTORY) === undefined));
  }

  /** Marks the conflicted paths in the repository's index the way a merge would, so git's own tools take over. */
  public stageConflicts(outcome: MergeOutcome): ResultAsync<void, SdkRepositoryProblem> {
    return this.git
      .stageConflicts(
        this.rootDirectory,
        outcome.stages.map((entry) => ({ ...entry, path: this.rootRelative(entry.path) }))
      )
      .mapErr(gitFailed);
  }

  private fetchSnapshots(remote: string): ResultAsync<void, SdkRepositoryProblem> {
    return this.guarded<void, SdkRepositoryProblem>(async function* () {
      const git = this.git;
      const root = this.rootDirectory;
      const ref = this.pristineRef();
      const remoteTip = yield* git.fetchRef(root, remote, ref).mapErr(gitFailed);
      if (remoteTip === undefined) {
        return ok(undefined);
      }
      const localTip = yield* git.resolveRef(root, ref).mapErr(gitFailed);
      if (localTip === undefined || (yield* git.isAncestor(root, localTip, remoteTip).mapErr(gitFailed))) {
        yield* git.updateRef(root, ref, remoteTip).mapErr(gitFailed);
      } else if (!(yield* git.isAncestor(root, remoteTip, localTip).mapErr(gitFailed))) {
        const tree = yield* git.treeOfCommit(root, localTip).mapErr(gitFailed);
        const joined = yield* git
          .commitTree(root, tree, [localTip, remoteTip], 'apimatic: pristine chains joined')
          .mapErr(gitFailed);
        yield* git.updateRef(root, ref, joined).mapErr(gitFailed);
      }
      return ok(undefined);
    });
  }

  private verifyNotNested(): ResultAsync<void, SdkRepositoryProblem | NestedSdkDirectory> {
    const ref = this.pristineRef();
    return this.pristineRefsIn().andThen((refs): Result<void, NestedSdkDirectory> => {
      const colliding = refs.find((existing) => existing.collidesWith(ref));
      if (colliding === undefined) {
        return ok(undefined);
      }
      const other = this.rootDirectory.join(colliding.sdkPath());
      return err({ kind: 'nestedSdkDirectory', other, encloses: other.contains(this.sdk) });
    });
  }

  private writeRecord(record: GenerationRecord): ResultAsync<FilePath, SdkRepositoryProblem> {
    const file = this.recordFile();
    const attributes = new FilePath(this.sdk.join(RECORD_DIRECTORY), new FileName(RECORD_ATTRIBUTES_FILE));
    return onDisk(this.fileService.replaceContentsIfChanged(attributes, RECORD_ATTRIBUTES))
      .andThen(() => onDisk(this.fileService.replaceContentsIfChanged(file, record.toJson())))
      .map(() => file)
      .mapErr((problem) => ({ kind: 'recordNotWritten', reason: problem.reason }));
  }

  private unresolvedConflicts(): ResultAsync<RelativeFilePath[], SdkRepositoryProblem> {
    const prefix = this.sdkPath();
    return this.git
      .unmergedStages(this.rootDirectory, this.sdkPathspec())
      .mapErr(gitFailed)
      .map((stages) => {
        const paths = new Map(stages.map((entry) => [entry.path.toString(), entry.path]));
        return [...paths.values()].flatMap((path) => path.inside(prefix) ?? []);
      });
  }

  private sdkPathspec(): string {
    const prefix = this.sdkPath();
    return prefix === '' ? '.' : prefix;
  }

  private recordFile(): FilePath {
    return new FilePath(this.sdk.join(RECORD_DIRECTORY), new FileName(RECORD_FILE));
  }

  private pristineRefsIn(): ResultAsync<SnapshotRef[], SdkRepositoryProblem> {
    return this.git
      .listRefs(this.rootDirectory, SnapshotRef.pristineNamespace())
      .mapErr(gitFailed)
      .map((names) => names.map((name) => SnapshotRef.fromGit(name)));
  }

  private sdkPath(): string {
    return posix(path.relative(this.rootDirectory.toString(), this.sdk.toString()));
  }

  /** `steps` as one `Result`: the first `yield*` that fails answers with its problem, and nothing after it runs. */
  private guarded<T, E>(steps: (this: SdkRepositoryContext) => Steps<T, E>): ResultAsync<T, E> {
    return safeTry(steps.bind(this));
  }
}

const hookNotWritten = (problem: { reason: string }): SdkRepositoryProblem => ({
  kind: 'hookNotWritten',
  reason: problem.reason
});

/** The `pre-push` hook git runs from `directory`; husky's `_` holds its own runners, the developer's hooks sit beside it. */
function hookRunFrom(directory: DirectoryPath): FilePath {
  const scripts = path.basename(directory.toString()) === '_' ? directory.join('..') : directory;
  return new FilePath(scripts, new FileName('pre-push'));
}
