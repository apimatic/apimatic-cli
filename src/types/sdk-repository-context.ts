import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitOperation, GitService } from '../infrastructure/git-service.js';
import { errorMessage } from '../utils/error-utils.js';
import { DirectoryPath, posix } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { CommitId } from './git/commit-id.js';
import { StageEntry } from './git/merge-tree.js';
import { TreeId } from './git/tree-id.js';
import { relabelMarkers } from './sdk/conflict-markers.js';
import { describeGeneration, GenerationRecord, RECORD_ATTRIBUTES, SdkGeneration } from './sdk/generation-record.js';
import { ConflictSide, MergePlan } from './sdk/merge-plan.js';
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

export type SdkRepositoryProblem =
  | { kind: 'gitFailed' | 'recordNotWritten' | 'hookNotWritten'; reason: string }
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

/** A fresh generation merged over the directory as it is: the snapshot it will be recorded as, and the merge. */
export type Regeneration = { generated: TreeId; merge: MergeOutcome };

/** The merge's two commits are yours (`ours`) and the generator's (`theirs`). */
const GIT_SIDES: Record<ConflictSide, 'ours' | 'theirs'> = { yours: 'ours', generated: 'theirs' };

const RECORD_DIRECTORY = '.apimatic';
const RECORD_FILE = 'generation.json';
const RECORD_ATTRIBUTES_FILE = '.gitattributes';

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
   * Everything a run needs to know before it decides how to write. Refused while the developer
   * is in the middle of a merge of their own, and for a nested SDK directory. Files the last
   * run left unmerged come first, whatever the record says, so no run writes over them. A
   * recorded snapshot the repository lacks is fetched from `remote` first.
   */
  public async inspect(
    generation: SdkGeneration,
    remote: string | undefined
  ): Promise<Result<SdkRepositoryState, InspectionProblem>> {
    let operation: GitOperation | undefined;
    try {
      operation = await this.git.operationInProgress(this.rootDirectory);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
    if (operation !== undefined) {
      return err({ kind: 'operationInProgress', operation, root: this.rootDirectory });
    }
    const notNested = await this.verifyNotNested();
    if (notNested.isErr()) {
      return err(notNested.error);
    }
    const paths = await this.unresolvedConflicts();
    if (paths.length > 0) {
      return ok({ kind: 'unresolved', paths });
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
    return ok({ kind: 'ready', base });
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
    await fs.promises.chmod(file.toString(), 0o700);
  }

  /**
   * Settles what is left of the conflicts in `paths` for `side`, from the two sides git kept in
   * the index and the files as they are now (`settledContent`), and takes the files out of the
   * unmerged state, so `git status` stops listing them as both modified.
   */
  public async settleUnresolved(
    side: ConflictSide,
    paths: readonly RelativeFilePath[]
  ): Promise<Result<void, SdkRepositoryProblem>> {
    const root = this.rootDirectory;
    try {
      const stages = await this.git.unmergedStages(root, this.sdkPathspec());
      const blobs = await this.git.readBlobs(root, [...new Set(stages.map((entry) => entry.oid))]);
      for (const path of paths) {
        const key = this.rootRelative(path).toString();
        const stage = (number: StageEntry['stage']) => {
          const entry = stages.find((candidate) => candidate.stage === number && candidate.path.toString() === key);
          return entry === undefined ? undefined : blobs.get(entry.oid);
        };
        const file = path.in(this.sdk);
        const disk = (await this.fileService.fileExists(file))
          ? new Uint8Array(await fs.promises.readFile(file.toString()))
          : undefined;
        const settled = settledContent(side, { disk, yours: stage(2), generated: stage(3) });
        if (settled === undefined) {
          await fs.promises.rm(file.toString(), { force: true });
        } else if (settled !== disk) {
          await this.put(file, await this.withLineEnding(settled, file));
        }
      }
      await this.git.unstage(
        root,
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
  public async snapshotDisk(
    base: CommitId | undefined,
    lineEndings: 'normalized' | 'asIs' = 'normalized'
  ): Promise<Result<TreeId, SdkRepositoryProblem>> {
    try {
      const include =
        base === undefined ? [] : (await this.git.listTree(this.rootDirectory, base)).map((entry) => entry.path);
      return ok(await this.git.treeOf(this.rootDirectory, this.sdk, include, lineEndings));
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
    cliVersion: string
  ): Promise<Result<GenerationRecord, SdkRepositoryProblem>> {
    const pristine = await this.recordPristine(generated, generation);
    if (pristine.isErr()) {
      return err(pristine.error);
    }
    const record = GenerationRecord.written(generation, pristine.value, new Date(), cliVersion);
    return (await this.writeRecord(record)).map(() => record);
  }

  /** Keeps the SDK directory as it is on disk, byte for byte, replacing what the last run kept, so a merge can be undone. */
  public async savePrevious(base: CommitId | undefined): Promise<Result<CommitId, SdkRepositoryProblem>> {
    const disk = await this.snapshotDisk(base, 'asIs');
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
    favour?: ConflictSide
  ): Promise<Result<MergeOutcome, SdkRepositoryProblem>> {
    const root = this.rootDirectory;
    try {
      const baseTree = await this.git.treeOfCommit(root, base);
      const yours = await this.git.commitTree(root, disk, [base], 'apimatic: your changes');
      const theirs = await this.git.commitTree(root, generated, [base], 'apimatic: generated');
      const merge = await this.git.mergeTree(root, yours, theirs, favour && GIT_SIDES[favour]);
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

  /**
   * The generation in `generated` merged over the directory against `base`, in one step: both
   * trees are snapshotted, then merged, favouring one side where asked.
   */
  public async regenerate(
    base: CommitId,
    generated: DirectoryPath,
    favour?: ConflictSide
  ): Promise<Result<Regeneration, SdkRepositoryProblem>> {
    const generatedTree = await this.snapshotGenerated(generated);
    if (generatedTree.isErr()) {
      return err(generatedTree.error);
    }
    const disk = await this.snapshotDisk(base);
    if (disk.isErr()) {
      return err(disk.error);
    }
    return (await this.merge(base, disk.value, generatedTree.value, favour)).map((merge) => ({
      generated: generatedTree.value,
      merge
    }));
  }

  /**
   * Keeps the directory as it is under the previous ref, then applies the plan, removals before
   * writes so a path renamed only in case lands on a filesystem that ignores case. A write or
   * removal that fails ends the run and puts back, from that ref, every path it had changed, so
   * the directory is as it was; the ref stays for a developer to restore from by hand.
   */
  public async write(
    base: CommitId,
    plan: MergePlan,
    generated: DirectoryPath
  ): Promise<Result<void, SdkRepositoryProblem>> {
    const previous = await this.savePrevious(base);
    return previous.isErr() ? err(previous.error) : this.apply(plan, previous.value, generated);
  }

  private async apply(
    plan: MergePlan,
    previous: CommitId,
    generated: DirectoryPath
  ): Promise<Result<void, SdkRepositoryProblem>> {
    let blobs: Map<string, Uint8Array>;
    try {
      blobs = await this.git.readBlobs(this.rootDirectory, [...new Set(plan.writes.map((write) => write.blob))]);
    } catch (error) {
      return err(gitFailed(errorMessage(error)));
    }
    const steps: { path: RelativeFilePath; operation: NotApplied['operation']; run: () => Promise<void> }[] = [
      ...plan.deletes.map((path) => ({ path, operation: 'remove' as const, run: () => this.remove(path.in(this.sdk)) })),
      ...plan.writes.map((write) => ({
        path: write.path,
        operation: 'write' as const,
        run: async () => {
          const content = blobs.get(write.blob)!;
          const labelled = plan.hasMarkers(write.path) ? relabelMarkers(content) : content;
          const file = write.path.in(this.sdk);
          return this.put(file, await this.withLineEnding(labelled, file, write.path.in(generated)));
        }
      }))
    ];
    const touched: RelativeFilePath[] = [];
    for (const step of steps) {
      touched.push(step.path);
      try {
        await step.run();
      } catch (error) {
        return err({
          kind: 'notApplied',
          file: step.path.in(this.sdk),
          operation: step.operation,
          reason: errorMessage(error),
          undo: await this.undo(previous, touched)
        });
      }
    }
    return ok(undefined);
  }

  private async undo(previous: CommitId, touched: readonly RelativeFilePath[]): Promise<NotApplied['undo']> {
    try {
      const kept = new Map(
        (await this.git.listTree(this.rootDirectory, previous)).map((entry) => [entry.path.toString(), entry.oid])
      );
      const oids = touched.flatMap((relative) => kept.get(relative.toString()) ?? []);
      const blobs = await this.git.readBlobs(this.rootDirectory, [...new Set(oids)]);
      for (const relative of touched) {
        const oid = kept.get(relative.toString());
        await (oid === undefined
          ? this.remove(relative.in(this.sdk))
          : this.put(relative.in(this.sdk), blobs.get(oid)!));
      }
      return { kind: 'done' };
    } catch (error) {
      return { kind: 'failed', reason: errorMessage(error), previous: this.previousRef() };
    }
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
      await this.fileService.replaceContentsIfChanged(
        new FilePath(this.sdk.join(RECORD_DIRECTORY), new FileName(RECORD_ATTRIBUTES_FILE)),
        RECORD_ATTRIBUTES
      );
      await this.fileService.replaceContentsIfChanged(file, record.toJson());
      return ok(file);
    } catch (error) {
      return err({ kind: 'recordNotWritten', reason: errorMessage(error) });
    }
  }

  private async unresolvedConflicts(): Promise<RelativeFilePath[]> {
    const prefix = this.sdkPath();
    const stages = await this.git.unmergedStages(this.rootDirectory, this.sdkPathspec());
    const paths = new Map(stages.map((entry) => [entry.path.toString(), entry.path]));
    return [...paths.values()].flatMap((path) => path.inside(prefix) ?? []);
  }

  private sdkPathspec(): string {
    const prefix = this.sdkPath();
    return prefix === '' ? '.' : prefix;
  }

  private recordFile(): FilePath {
    return new FilePath(this.sdk.join(RECORD_DIRECTORY), new FileName(RECORD_FILE));
  }

  private async pristineRefsIn(): Promise<SnapshotRef[]> {
    const namespace = SnapshotRef.pristineNamespace();
    return (await this.git.listRefs(this.rootDirectory, namespace)).map((name) => SnapshotRef.fromGit(name));
  }

  private sdkPath(): string {
    return posix(path.relative(this.rootDirectory.toString(), this.sdk.toString()));
  }
}

const gitFailed = (reason: string): SdkRepositoryProblem => ({ kind: 'gitFailed', reason });
