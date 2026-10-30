import { Buffer } from 'node:buffer';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../../infrastructure/file-service.js';
import { GitService } from '../../infrastructure/git-service.js';
import { SdkGenerationService } from '../../infrastructure/services/sdk-generation-service.js';
import { canonical, withDirPath } from '../../infrastructure/tmp-extensions.js';
import { ZipService } from '../../infrastructure/zip-service.js';
import { SdkGeneratePrompts } from '../../prompts/sdk/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ValueMap, ValueSet } from '../../types/common/value-map.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { FileProblem } from '../../types/file/file-problem.js';
import { RelativeDirectoryPath } from '../../types/file/relativeDirectoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { NO_PATHS } from '../../types/file/relative-paths.js';
import { BlobId } from '../../types/git/blob-id.js';
import { CommitId } from '../../types/git/commit-id.js';
import { GIT_DIRECTORY } from '../../types/git/git-directory.js';
import { GitOperation } from '../../types/git/git-operation.js';
import { GitVersion } from '../../types/git/git-version.js';
import { Change, MergeMessageKind, MergeTreeOutput, STAGE, StageEntry } from '../../types/git/merge-tree.js';
import { OBJECT_ID } from '../../types/git/object-id.js';
import { RemoteName } from '../../types/git/remote-name.js';
import { TreeId } from '../../types/git/tree-id.js';
import { ProjectContext } from '../../types/project-context.js';
import { isAvailableLanguage } from '../../types/sdk/generate.js';
import {
  GenerationRecord,
  isRecordPath,
  RECORD_ATTRIBUTES,
  RECORD_DIRECTORY,
  RECORD_FILE
} from '../../types/sdk/generation-record.js';
import { GenerationRequest, SdkGeneration } from '../../types/sdk/sdk-generation.js';
import { PRISTINE_REF, SNAPSHOT_REFS, SnapshotRef } from '../../types/sdk/snapshot-ref.js';
import { TempContext } from '../../types/temp-context.js';
import { errorMessage } from '../../utils/error-utils.js';
import { ActionResult } from '../action-result.js';

// ---------------------------------------------------------------------------------------------
// How the run was started
// ---------------------------------------------------------------------------------------------

/** Whether the run may put a question to the developer, decided once by the command that started it. */
export type Interaction = 'ask' | 'never';

/** How the run was started: whether it may ask, whether `--force` answers for it, and whether `--git-init` was given. */
export type RunMode = { force: boolean; interaction: Interaction; gitInit: boolean };

/** What happens when files conflict: the developer is asked, `--force` takes the generator's side, or the run stops. */
export type OnConflict = 'ask' | 'generated' | 'refuse';

/** How the run meets conflicts, this run's or the last run's: a terminal run asks, and any other run stops unless `--force` answers. */
export function onConflictFor(run: RunMode): OnConflict {
  if (run.force) {
    return 'generated';
  }
  return run.interaction === 'ask' ? 'ask' : 'refuse';
}

// ---------------------------------------------------------------------------------------------
// What the repository can say, and what can go wrong in it
// ---------------------------------------------------------------------------------------------

/** Why a git or file operation did not happen, in git's or the file system's own words. */
export type RepositoryProblem = { reason: string };

/** The repository is in the middle of a git operation of the developer's own, which a run must not merge over; named so the developer can clear it. */
export type OperationInProgress = { kind: 'operationInProgress'; operation: GitOperation; root: DirectoryPath };

/** Why a run could not find out how to write the SDK directory: a refusal it can name, or git's own words. */
export type InspectionProblem = OperationInProgress | RepositoryProblem;

/** Why a recorded snapshot is still absent after the one place it could have come from was tried. */
export type SnapshotFetch =
  | { kind: 'noRemote' }
  | { kind: 'absent'; remote: RemoteName }
  | { kind: 'failed'; remote: RemoteName; reason: string };

/** What the repository knows about its SDK directory before a run, from the record and the refs. */
export type SdkRepositoryState =
  | { kind: 'noRecord' }
  | { kind: 'otherGeneration' }
  | { kind: 'snapshotMissing'; fetch: SnapshotFetch }
  | { kind: 'unresolved'; paths: RelativeFilePath[] }
  | { kind: 'ready'; base: CommitId };

/** A file the run could not write or remove; what it had changed is put back from the previous snapshot, else that snapshot is named. */
export type NotApplied = {
  kind: 'notApplied';
  file: FilePath;
  operation: 'write' | 'remove';
  reason: string;
  undo: { kind: 'done' } | { kind: 'failed'; reason: string; previous: SnapshotRef };
};

/** A write that stopped at a file, or one that did not start. */
export type WriteProblem = NotApplied | RepositoryProblem;

/** The git command that puts the SDK directory back as the previous snapshot has it, run in its own repository; `sdk` spelt as the developer will type it. */
export const restoreCommand = (sdk: string, previous: SnapshotRef): string =>
  `git -C ${sdk} restore --source=${previous} --worktree -- .`;

/** Which step of recording a generation did not happen, in git's or the file system's words: the snapshot with its record, or the hook that shares them. */
export type RecordProblem = { step: 'snapshot' | 'hook'; reason: string };

/** What the developer does so the hook shares snapshots: add the call to the hook file, and commit it where it is in the repository. */
export type ShareHookStep = 'addCall' | 'commit';

/**
 * The hook runs the script (`written` when this run put the call there), or the one line to add
 * to `file`: because git runs hooks from `runFrom`, or because the hook there is not a shell script.
 */
export type ShareHookInstall =
  | { kind: 'installed'; file: FilePath; written: boolean }
  | { kind: 'elsewhere'; file: FilePath; runFrom: DirectoryPath; script: FilePath; steps: readonly ShareHookStep[] }
  | { kind: 'notShell'; file: FilePath; shebang: string; script: FilePath; steps: readonly ShareHookStep[] };

export type ShareHookNeedsOneStep = Exclude<ShareHookInstall, { kind: 'installed' }>;

// ---------------------------------------------------------------------------------------------
// The repository's facts, and what they mean
// ---------------------------------------------------------------------------------------------

/** What the repository says about its SDK directory, every fact read before any of them is weighed. */
export type RepositoryFacts = {
  root: DirectoryPath;
  /** A merge, rebase, cherry-pick or revert of the developer's own, mid-way. */
  operation: GitOperation | undefined;
  /** The paths git still holds as unmerged. */
  unresolved: readonly RelativeFilePath[];
  record: GenerationRecord | undefined;
  /** Whether the recorded pristine commit is in the repository; false without a record. */
  baseHere: boolean;
  /** Where a missing snapshot could be fetched from. */
  remote: RemoteName | undefined;
};

/** The recorded base is not here, and `remote` may have it: the one fact a run reads from elsewhere. */
export type FetchNeeded = { kind: 'fetchNeeded'; base: CommitId; remote: RemoteName };

/** What fetching came to: the remote did not answer, or it did and the base is here or not. */
export type FetchOutcome = { kind: 'failed'; reason: string } | { kind: 'fetched'; baseHere: boolean };

/**
 * What the facts mean, in the order they matter: an operation in progress is refused, unmerged
 * files come first, then the record, then whether its base is here or must be fetched.
 */
export function classify(
  facts: RepositoryFacts,
  generation: SdkGeneration
): Result<SdkRepositoryState | FetchNeeded, OperationInProgress> {
  if (facts.operation !== undefined) {
    return err({ kind: 'operationInProgress', operation: facts.operation, root: facts.root });
  }
  if (facts.unresolved.length > 0) {
    return ok({ kind: 'unresolved', paths: [...facts.unresolved] });
  }
  if (facts.record === undefined) {
    return ok({ kind: 'noRecord' });
  }
  if (!facts.record.isFor(generation)) {
    return ok({ kind: 'otherGeneration' });
  }
  const base = facts.record.pristineCommit();
  if (facts.baseHere) {
    return ok({ kind: 'ready', base });
  }
  if (facts.remote === undefined) {
    return ok({ kind: 'snapshotMissing', fetch: { kind: 'noRemote' } });
  }
  return ok({ kind: 'fetchNeeded', base, remote: facts.remote });
}

/** The state once the fetch `needed` has been tried: ready when it brought the base, else why the base is still missing. */
export function afterFetch(needed: FetchNeeded, outcome: FetchOutcome): SdkRepositoryState {
  if (outcome.kind === 'failed') {
    return { kind: 'snapshotMissing', fetch: { kind: 'failed', remote: needed.remote, reason: outcome.reason } };
  }
  return outcome.baseHere
    ? { kind: 'ready', base: needed.base }
    : { kind: 'snapshotMissing', fetch: { kind: 'absent', remote: needed.remote } };
}

// ---------------------------------------------------------------------------------------------
// Two pristine chains meeting
// ---------------------------------------------------------------------------------------------

/** The local pristine chain's tip and a fetched one's, with how they relate; no local tip when this machine has none yet. */
export type ChainFacts = {
  local: CommitId | undefined;
  remote: CommitId;
  /** The remote chain continues the local one. */
  localContinuesToRemote: boolean;
  /** The local chain continues the remote one. */
  remoteBehindLocal: boolean;
};

/** Adopt the remote tip, keep the local one, or join two that diverged with a two-parent commit. */
export type Reconciliation = { kind: 'adopt' } | { kind: 'keep' } | { kind: 'join'; local: CommitId; remote: CommitId };

/** How a fetched pristine chain meets the local one, so neither machine's generations are lost. */
export function reconcile(chains: ChainFacts): Reconciliation {
  if (chains.local === undefined || chains.localContinuesToRemote) {
    return { kind: 'adopt' };
  }
  if (chains.remoteBehindLocal) {
    return { kind: 'keep' };
  }
  return { kind: 'join', local: chains.local, remote: chains.remote };
}

// ---------------------------------------------------------------------------------------------
// How the run will write the SDK directory
// ---------------------------------------------------------------------------------------------

/** Why a run records a fresh snapshot instead of merging: there is no base, or not one for this generation. */
export type RecordReason = Exclude<SdkRepositoryState, { kind: 'ready' | 'unresolved' }>;

/**
 * How a run will write the SDK directory, decided before anything is uploaded, with the reason the
 * developer is told. `Repository` is whatever the shell writes through; the decision never looks at it.
 */
export type SdkDestination<Repository = undefined> =
  | { kind: 'overwrite'; found: GitVersion | undefined }
  | { kind: 'noRepository' }
  | { kind: 'record'; repository: Repository; because: RecordReason }
  | { kind: 'merge'; repository: Repository; base: CommitId };

/** The last run's markers are still in the files; nothing is decided until the developer settles them. */
export type Unresolved<Repository = undefined> = {
  kind: 'unresolved';
  repository: Repository;
  paths: readonly RelativeFilePath[];
};

/** What the state of the SDK directory's own repository means for the run: merge against the base, settle first, or record afresh. */
export function destinationFor<Repository>(
  repository: Repository,
  state: SdkRepositoryState
): SdkDestination<Repository> | Unresolved<Repository> {
  switch (state.kind) {
    case 'ready':
      return { kind: 'merge', repository, base: state.base };
    case 'unresolved':
      return { kind: 'unresolved', repository, paths: state.paths };
    case 'noRecord':
    case 'otherGeneration':
    case 'snapshotMissing':
      return { kind: 'record', repository, because: state };
  }
}

/** Whether the run empties the directory first, which is what the overwrite question is about. */
export function replacesDirectory(destination: SdkDestination<unknown>): boolean {
  return destination.kind !== 'merge';
}

/** What the developer hears about the destination before anything is uploaded. */
export type DestinationNotice =
  | { kind: 'gitUnavailable'; found: GitVersion | undefined }
  | { kind: 'snapshotMissing'; fetch: SnapshotFetch };

/** Why a run stops before generating: the overwrite question with no one to answer it. */
export type WriteRefusal = { kind: 'cannotAskToOverwrite' };

/** How the run writes the SDK directory, with the one question each way may still need. */
export type WriteMode<Repository> =
  | { kind: 'refuse'; because: WriteRefusal }
  /** Replace the directory; `suggestGitInit` when no repository will keep the developer's edits, for the steps that make one. */
  | { kind: 'save'; confirmOverwrite: boolean; suggestGitInit: boolean }
  /** Make the directory a repository of its own, then record. */
  | { kind: 'init'; confirmOverwrite: boolean }
  /**
   * Record in the directory's repository; `announceRepository` on the first run to record there,
   * `warnReplacedRecord` when `--force` replaces a recorded SDK the run could not merge into.
   */
  | {
      kind: 'record';
      repository: Repository;
      confirmOverwrite: boolean;
      announceRepository: boolean;
      warnReplacedRecord: boolean;
    }
  | { kind: 'merge'; repository: Repository; base: CommitId; confirmOverwrite: false; onConflict: OnConflict };

/** What the destination means for the developer, before the run decides anything about writing. */
export function noticeFor(destination: SdkDestination<unknown> | Unresolved<unknown>): DestinationNotice | undefined {
  if (destination.kind === 'overwrite') {
    return { kind: 'gitUnavailable', found: destination.found };
  }
  if (destination.kind === 'record' && destination.because.kind === 'snapshotMissing') {
    return { kind: 'snapshotMissing', fetch: destination.because.fetch };
  }
  return undefined;
}

/**
 * The run's write mode from its destination and how it was started. Emptying a non-empty directory
 * is confirmed unless `--force` answers; a run that cannot ask stops where it would have had to.
 */
export function writeModeFor<Repository>(
  destination: SdkDestination<Repository>,
  run: RunMode,
  directoryHoldsFiles: boolean
): WriteMode<Repository> {
  const confirmOverwrite = !run.force && directoryHoldsFiles && replacesDirectory(destination);
  if (confirmOverwrite && run.interaction === 'never') {
    return { kind: 'refuse', because: { kind: 'cannotAskToOverwrite' } };
  }
  switch (destination.kind) {
    case 'overwrite':
      return { kind: 'save', confirmOverwrite, suggestGitInit: false };
    case 'noRepository':
      return run.gitInit
        ? { kind: 'init', confirmOverwrite }
        : { kind: 'save', confirmOverwrite, suggestGitInit: true };
    case 'record': {
      const recorded = destination.because.kind !== 'noRecord';
      return {
        kind: 'record',
        repository: destination.repository,
        confirmOverwrite,
        announceRepository: !recorded,
        warnReplacedRecord: run.force && recorded
      };
    }
    case 'merge':
      return {
        kind: 'merge',
        repository: destination.repository,
        base: destination.base,
        confirmOverwrite: false,
        onConflict: onConflictFor(run)
      };
  }
}

// ---------------------------------------------------------------------------------------------
// File content: binaries, line endings, text as bytes
// ---------------------------------------------------------------------------------------------

// Git's own test: a NUL in the first 8000 bytes makes a file binary, and a binary file is never merged line by line.
export const isBinary = (content: Uint8Array): boolean => content.subarray(0, 8000).includes(0);

/** A file whose line endings are never changed: a binary one, or one that already carries a CR. */
export const keepsLineEndings = (content: Uint8Array): boolean => content.includes(0x0d) || isBinary(content);

// One byte is one character and back, whatever the file's encoding, so only the lines touched can change.
export const asText = (content: Uint8Array): string => Buffer.from(content).toString('latin1');
export const asBytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'latin1'));

/** `content` written the way `sample` ends its lines: CRLF where the sample uses it, else as it is. */
export function lineEndingFor(content: Uint8Array, sample: Uint8Array | undefined): Uint8Array {
  if (sample === undefined || keepsLineEndings(content) || !asText(sample).includes('\r\n')) {
    return content;
  }
  return asBytes(asText(content).replace(/\n/g, '\r\n'));
}

// ---------------------------------------------------------------------------------------------
// Conflict markers
// ---------------------------------------------------------------------------------------------

/** Whose lines win where you and the generator changed the same ones. */
export type ConflictSide = 'generated' | 'yours';

export const YOURS_MARKER = '<<<<<<< Your changes';
export const GENERATED_MARKER = '>>>>>>> Generated by APIMatic';

// Git labels a side with the id of the commit it merged, followed by `:path` where the file was renamed.
const YOURS_LABEL = new RegExp(`^<<<<<<< ${OBJECT_ID}(?::[^\\r\\n]*)?(?=\\r?$)`, 'gm');
const GENERATED_LABEL = new RegExp(`^>>>>>>> ${OBJECT_ID}(?::[^\\r\\n]*)?(?=\\r?$)`, 'gm');

/** The file with git's labels on its markers replaced by the CLI's, which name the sides; the same bytes when there are none. */
export function relabelMarkers(content: Uint8Array): Uint8Array {
  const text = asText(content);
  const relabelled = text.replace(YOURS_LABEL, YOURS_MARKER).replace(GENERATED_LABEL, GENERATED_MARKER);
  return relabelled === text ? content : asBytes(relabelled);
}

/** Each block settled for `side`, every line outside the markers kept; a file whose markers are not well formed is left whole. */
function resolveMarkers(content: string, side: ConflictSide): string {
  const resolved: string[] = [];
  let inside: 'none' | ConflictSide = 'none';
  for (const line of content.split('\n')) {
    const bare = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (bare === YOURS_MARKER) {
      if (inside !== 'none') {
        return content;
      }
      inside = 'yours';
    } else if (bare === GENERATED_MARKER) {
      if (inside !== 'generated') {
        return content;
      }
      inside = 'none';
    } else if (inside === 'yours' && bare === '=======') {
      inside = 'generated';
    } else if (inside === 'none' || inside === side) {
      resolved.push(line);
    }
  }
  return inside === 'none' ? resolved.join('\n') : content;
}

/** The file's bytes with each marker block settled for `side`; none when there is nothing to settle, or the markers are not well formed. */
export function settleMarkers(content: Uint8Array, side: ConflictSide): Uint8Array | undefined {
  const text = asText(content);
  const resolved = resolveMarkers(text, side);
  return resolved === text ? undefined : asBytes(resolved);
}

// ---------------------------------------------------------------------------------------------
// The merge plan: what git's merge means for the SDK directory
// ---------------------------------------------------------------------------------------------

/** The merge runs with your tree as git's "ours" and the generation as its "theirs". */
export const SIDE_STAGE = { yours: STAGE.ours, generated: STAGE.theirs } as const;

export type MergeInputs = {
  merge: MergeTreeOutput;
  /** Base to the disk: what you changed. Renames paired. */
  yours: readonly Change[];
  /** Base to the fresh generation: what the generator changed. Renames paired. */
  generated: readonly Change[];
  /** Disk to the merged tree: what the run writes and removes. No renames. */
  applied: readonly Change[];
  /** Every path the base holds. */
  basePaths: readonly RelativeFilePath[];
};

export type ConflictKind =
  /** You and the generator changed the same lines; the file holds markers. */
  | 'bothChanged'
  /** You and the generator both added the path with different content; the file holds markers. */
  | 'bothAdded'
  /** You deleted the file and the generator changed it; the new version is written back. */
  | 'deletedByYou'
  /** You edited the file and the generator no longer produces it; your file stays. */
  | 'noLongerGenerated'
  /** You and the generator both changed a binary file; yours stays. */
  | 'binary'
  /** A shape git reports that fits none of the above, such as both sides renaming one file differently. */
  | 'other';

/** A file to write, as the blob the merged tree holds; `settle` is the side whose lines win in each marker block. */
export type FileWrite = { path: RelativeFilePath; blob: BlobId; settle?: ConflictSide };

export type Conflict = { path: RelativeFilePath; kind: ConflictKind };

/** Each side's version of a file git could not merge line by line; none where that side has no file. */
export type Sides<T> = { yours: T | undefined; generated: T | undefined };

/** For each conflicted path, the blob each side holds for it. */
export type ConflictSides = ValueMap<RelativeFilePath, Sides<BlobId>>;

/**
 * The whole-file settlement for `side`, and which side it came from: the generator's side falls back
 * to yours where it no longer produces the file, so an edit of yours is never thrown away by a choice that keeps the rest.
 */
export function chosen<T>(side: ConflictSide, sides: Sides<T>): { side: ConflictSide; content: T } | undefined {
  if (side === 'generated' && sides.generated !== undefined) {
    return { side: 'generated', content: sides.generated };
  }
  return sides.yours === undefined ? undefined : { side: 'yours', content: sides.yours };
}

/** Every path the run touched or left alone, by what happened to it; conflicted paths are listed under `conflicts` instead. */
export type MergeFiles = {
  /** Files the generator produced for the first time. */
  added: readonly RelativeFilePath[];
  /** Unedited files replaced by their new version, or moved to the generator's new name. */
  updated: readonly RelativeFilePath[];
  /** Edited files the generator also changed, merged without conflict. */
  merged: readonly RelativeFilePath[];
  /** Unedited files the generator stopped producing. */
  removed: readonly RelativeFilePath[];
  /** Files you edited or added that the generator left alone, and conflicted files settled for your side. */
  kept: readonly RelativeFilePath[];
};

/** The `MergeFiles` holding files you edited. */
export const YOUR_FILES = ['merged', 'kept'] as const;

/** The stronger of two accounts of one path, when git reports it more than once. */
const RANK: Record<ConflictKind, number> = {
  binary: 5,
  bothAdded: 4,
  deletedByYou: 3,
  noLongerGenerated: 3,
  bothChanged: 2,
  other: 1
};

/** What a conflict git reported means here; a deletion is yours or the generator's by which side still has the file. */
function conflictKindOf(
  reported: Exclude<MergeMessageKind, 'informational'>,
  stages: ReadonlySet<number>
): ConflictKind {
  switch (reported) {
    case 'binary':
      return 'binary';
    case 'addAdd':
      return 'bothAdded';
    case 'modifyDelete':
    case 'renameDelete':
      return stages.has(SIDE_STAGE.yours) ? 'noLongerGenerated' : 'deletedByYou';
    case 'contents':
      return 'bothChanged';
    case 'otherConflict':
      return 'other';
  }
}

function conflictsOf(merge: MergeTreeOutput): Conflict[] {
  const stagesByPath = new ValueMap<RelativeFilePath, Set<number>>();
  for (const entry of merge.stages) {
    stagesByPath.set(entry.path, (stagesByPath.get(entry.path) ?? new Set()).add(entry.stage));
  }
  const byPath = new ValueMap<RelativeFilePath, Conflict>();
  for (const { paths, kind: reported } of merge.messages) {
    if (reported === 'informational') {
      continue;
    }
    for (const path of paths) {
      const kind = conflictKindOf(reported, stagesByPath.get(path) ?? new Set());
      const known = byPath.get(path);
      if (known === undefined || RANK[kind] > RANK[known.kind]) {
        byPath.set(path, { path, kind });
      }
    }
  }
  return byPath.values();
}

/** The conflicts whose file is written with markers in it. */
const MARKED_KINDS: readonly ConflictKind[] = ['bothChanged', 'bothAdded'];

const leavesMarkers = (conflict: Conflict): boolean => MARKED_KINDS.includes(conflict.kind);

/** Each change under every path it names, so a rename is found by either name. */
const changedPaths = (changes: readonly Change[]): ValueMap<RelativeFilePath, Change> =>
  new ValueMap(
    changes.flatMap((change): [RelativeFilePath, Change][] =>
      'from' in change
        ? [
            [change.from, change],
            [change.path, change]
          ]
        : [[change.path, change]]
    )
  );

/** The blob a side holds at `path` itself; none where its change moved the file away from there. */
const blobAt = (changes: ValueMap<RelativeFilePath, Change>, path: RelativeFilePath): BlobId | undefined => {
  const change = changes.get(path);
  return change !== undefined && change.path.isEqual(path) && 'blob' in change ? change.blob : undefined;
};

/** What the summary reports: every path that is not in conflict, by what happened to it. */
function filesOf(
  inputs: MergeInputs,
  conflicted: ValueSet<RelativeFilePath>,
  yours: ValueMap<RelativeFilePath, Change>,
  generated: ValueMap<RelativeFilePath, Change>
): MergeFiles {
  const base = new ValueSet(inputs.basePaths);
  const files: Record<keyof MergeFiles, RelativeFilePath[]> = {
    added: [],
    updated: [],
    merged: [],
    removed: [],
    kept: []
  };
  for (const change of inputs.applied) {
    const { path } = change;
    if (conflicted.has(path)) {
      continue;
    }
    if (change.status === 'D') {
      files.removed.push(path);
    } else if (!base.has(path) && generated.get(path)?.status === 'A') {
      files.added.push(path);
    } else if (yours.get(path)?.status === 'M' && generated.has(path)) {
      files.merged.push(path);
    } else {
      files.updated.push(path);
    }
  }
  for (const [path, change] of yours) {
    if ((change.status === 'M' || change.status === 'A') && !generated.has(path) && !conflicted.has(path)) {
      files.kept.push(change.path);
    }
  }
  return files;
}

/** What a run writes and removes below the SDK directory; a path the plan does not mention is left as it is. */
export class MergePlan {
  public readonly writes: readonly FileWrite[];
  public readonly deletes: readonly RelativeFilePath[];
  public readonly conflicts: readonly Conflict[];
  public readonly files: MergeFiles;
  private readonly sides: ConflictSides;

  constructor(
    writes: readonly FileWrite[],
    deletes: readonly RelativeFilePath[],
    conflicts: readonly Conflict[],
    files: MergeFiles,
    sides: ConflictSides = new ValueMap()
  ) {
    this.writes = writes;
    this.deletes = deletes;
    this.conflicts = conflicts;
    this.files = files;
    this.sides = sides;
  }

  /** What git's merge means for the SDK directory: writes, deletions, conflicts with each side's version, and the summary. */
  public static from(inputs: MergeInputs): MergePlan {
    const conflicts = conflictsOf(inputs.merge);
    const conflicted = new ValueSet(conflicts.map((conflict) => conflict.path));
    const yours = changedPaths(inputs.yours);
    const generated = changedPaths(inputs.generated);
    const writes = inputs.applied.flatMap((change) =>
      change.status === 'D' ? [] : [{ path: change.path, blob: change.blob }]
    );
    const deletes = inputs.applied.flatMap((change) => (change.status === 'D' ? [change.path] : []));
    const sides: ConflictSides = new ValueMap(
      conflicts.map((conflict): [RelativeFilePath, Sides<BlobId>] => [
        conflict.path,
        { yours: blobAt(yours, conflict.path), generated: blobAt(generated, conflict.path) }
      ])
    );
    return new MergePlan(writes, deletes, conflicts, filesOf(inputs, conflicted, yours, generated), sides);
  }

  /**
   * Every conflict settled for `side`: a marked file block by block as it is written, the rest
   * whole as `chosen` decides; a conflict of another shape keeps git's placement.
   */
  public taking(side: ConflictSide): MergePlan {
    const writes = new ValueMap(this.writes.map((write): [RelativeFilePath, FileWrite] => [write.path, write]));
    const deletes = new ValueSet(this.deletes);
    const updated = [...this.files.updated];
    const merged = [...this.files.merged];
    const kept = [...this.files.kept];
    for (const conflict of this.conflicts) {
      const { path, kind } = conflict;
      if (kind === 'other') {
        continue;
      }
      const marked = writes.get(path);
      if (leavesMarkers(conflict) && marked !== undefined) {
        writes.set(path, { ...marked, settle: side });
        merged.push(path);
        continue;
      }
      const picked = chosen(side, this.sides.get(path) ?? { yours: undefined, generated: undefined });
      deletes.delete(path);
      if (picked === undefined) {
        writes.delete(path);
      } else if (picked.side === 'yours') {
        writes.delete(path);
        kept.push(path);
      } else {
        writes.set(path, { path, blob: picked.content });
        updated.push(path);
      }
    }
    return new MergePlan(writes.values(), deletes.values(), [], { ...this.files, updated, merged, kept });
  }

  public hasConflicts(): boolean {
    return this.conflicts.length > 0;
  }

  public conflictedPaths(): RelativeFilePath[] {
    return this.conflicts.map((conflict) => conflict.path);
  }

  /** The conflicted files written with conflict markers in them. */
  public markedPaths(): RelativeFilePath[] {
    return this.conflicts.filter(leavesMarkers).map((conflict) => conflict.path);
  }

  /** The conflicted files left without markers, for you to keep or remove. */
  public unmarkedPaths(): RelativeFilePath[] {
    return this.conflicts.filter((conflict) => !leavesMarkers(conflict)).map((conflict) => conflict.path);
  }

  /** Whether the file at `path` is written with conflict markers in it. */
  public hasMarkers(path: RelativeFilePath): boolean {
    return this.conflicts.some((conflict) => conflict.path.isEqual(path) && leavesMarkers(conflict));
  }
}

/** The plan, and git's versions of every conflicted path, below the SDK directory. */
export type MergeOutcome = { plan: MergePlan; stages: StageEntry[] };

/** A fresh generation merged over the directory as it is: the snapshot it will be recorded as, and the merge. */
export type Regeneration = { generated: TreeId; merge: MergeOutcome };

// ---------------------------------------------------------------------------------------------
// Settling conflicts: this run's, and the last run's
// ---------------------------------------------------------------------------------------------

/** How the developer answered when a regeneration conflicted: resolve the markers themselves, let one side win, or stop the run. */
export type ConflictChoice = 'resolve' | ConflictSide | 'cancel';

/** How the developer answered about the last run's unresolved files: finish resolving themselves, let one side win, or back out. */
export type UnresolvedChoice = 'resolve' | ConflictSide | 'cancel';

/** A regeneration with its conflicts settled: the plan to write, and the side and paths settled for it, if any. */
export type Settlement = {
  plan: MergePlan;
  settled?: { side: ConflictSide; paths: readonly RelativeFilePath[] };
};

/** The merge as git made it, markers and all, when the developer resolves; else every conflict taken for the side chosen. */
export function settle(regeneration: Regeneration, choice: Exclude<ConflictChoice, 'cancel'>): Settlement {
  const { plan } = regeneration.merge;
  if (choice === 'resolve') {
    return { plan };
  }
  return { plan: plan.taking(choice), settled: { side: choice, paths: plan.conflictedPaths() } };
}

/** A file git still holds as unmerged: as it is on disk now, and the two sides git kept in the index; none where a side has no file. */
export type UnresolvedFile = Sides<Uint8Array> & { disk: Uint8Array | undefined };

/**
 * Markers still in the file settle in place; a file git could not merge line by line settles
 * whole as `chosen` decides; one whose markers are gone was resolved by hand and stays. None where it stays deleted.
 */
export function settledContent(side: ConflictSide, file: UnresolvedFile): Uint8Array | undefined {
  const marked = file.disk === undefined ? undefined : settleMarkers(file.disk, side);
  if (marked !== undefined) {
    return marked;
  }
  const whole =
    file.yours === undefined || file.generated === undefined || isBinary(file.yours) || isBinary(file.generated);
  if (!whole) {
    return file.disk;
  }
  const picked = chosen(side, file);
  if (picked === undefined) {
    return undefined;
  }
  return picked.side === 'yours' ? file.disk : picked.content;
}

/**
 * What a planned write puts on disk: the merged blob, relabelled where it holds markers and settled
 * where a side was chosen, ending its lines as the first of `samples` on disk does.
 */
export function contentToWrite(
  write: FileWrite,
  marked: boolean,
  blob: Uint8Array,
  samples: readonly (Uint8Array | undefined)[]
): Uint8Array {
  const labelled = marked || write.settle !== undefined ? relabelMarkers(blob) : blob;
  const content = write.settle === undefined ? labelled : settleMarkers(labelled, write.settle) ?? labelled;
  return lineEndingFor(
    content,
    samples.find((sample) => sample !== undefined)
  );
}

// ---------------------------------------------------------------------------------------------
// The hook that shares snapshots
// ---------------------------------------------------------------------------------------------

const BEGIN = '# >>> apimatic snapshots';
const END = '# <<< apimatic snapshots';
const DEFAULT_SHEBANG = '#!/bin/sh';
const SHELL_SHEBANG =
  /^#!\s*(?:\/usr\/bin\/env\s+)?(?:\/usr\/local\/bin\/|\/usr\/bin\/|\/bin\/)?(?:sh|bash|dash|zsh)(?:\s|$)/;

/** The file the CLI keeps in git's own hooks directory; the `pre-push` hook, wherever it lives, only calls it. */
export const SHARE_HOOK_SCRIPT_NAME = 'apimatic-pre-push';

/** Finds the script through git, so the line is the same wherever the hook lives; does nothing where the CLI never ran, and never fails the push. */
export const SHARE_HOOK_CALL =
  `f="$(git rev-parse --git-common-dir)/hooks/${SHARE_HOOK_SCRIPT_NAME}"; ` + '[ -f "$f" ] && sh "$f" "$@" || true';

/**
 * Pushes the pristine ref; when the remote's chain moved on, fetches it to
 * `refs/apimatic/remotes/<remote>/pristine`, joins the two, and pushes again. It never fails the developer's push.
 */
export const SHARE_HOOK_SCRIPT = [
  DEFAULT_SHEBANG,
  `# Shares the SDK snapshots (${PRISTINE_REF}) with the remote on every push, so a clone`,
  '# can merge its customizations. Written by the APIMatic CLI; the pre-push hook calls it.',
  'remote="$1"',
  `ref=${PRISTINE_REF}`,
  `tracking="${SNAPSHOT_REFS}/remotes/$remote/pristine"`,
  'git rev-parse -q --verify "$ref^{commit}" >/dev/null 2>&1 || exit 0',
  'GIT_TERMINAL_PROMPT=0 git push --quiet --no-verify "$remote" "$ref:$ref" >/dev/null 2>&1 && exit 0',
  'GIT_TERMINAL_PROMPT=0 git fetch --quiet --no-tags "$remote" "+$ref:$tracking" >/dev/null 2>&1 || true',
  'if git rev-parse -q --verify "$tracking^{commit}" >/dev/null 2>&1; then',
  '  if git merge-base --is-ancestor "$ref" "$tracking"; then',
  '    git update-ref "$ref" "$tracking"',
  '  elif ! git merge-base --is-ancestor "$tracking" "$ref"; then',
  "    joined=$(git -c user.name='APIMatic CLI' -c user.email=developer@apimatic.io \\",
  '      commit-tree "$ref^{tree}" -p "$ref" -p "$tracking" -m \'apimatic: pristine chains joined\')',
  '    git update-ref "$ref" "$joined"',
  '  fi',
  'fi',
  'said=$(GIT_TERMINAL_PROMPT=0 git push --quiet --no-verify "$remote" "$ref:$ref" 2>&1 >/dev/null) && exit 0',
  "reason=$(printf '%s\\n' \"$said\" | grep -m1 '^remote:' | sed 's/^remote: *//')",
  '[ -z "$reason" ] && reason=$(printf \'%s\\n\' "$said" | grep -m1 .)',
  'echo "apimatic: the SDK snapshots could not be pushed to $remote: $reason" >&2',
  'exit 0',
  ''
].join('\n');

/** The marked block a `pre-push` hook carries: the call, and nothing the CLI will ever need to update; the markers find it again. */
const SHARE_HOOK_BLOCK = [BEGIN, SHARE_HOOK_CALL, END].join('\n');

/** True when a hook, in whatever language and wherever it lives, already runs the script. */
export const hookCallsScript = (hook: string | undefined): boolean =>
  hook !== undefined && hook.includes(SHARE_HOOK_SCRIPT_NAME);

/** The `pre-push` hook git runs, in `hooks`; husky's `_` holds its own runners, the developer's hooks sit beside it. */
export function hookFileIn(hooks: DirectoryPath): FilePath {
  const scripts = hooks.leafName() === '_' ? hooks.join('..') : hooks;
  return new FilePath(scripts, new FileName('pre-push'));
}

/** The hook git runs, as found on disk, and where the script it should call lives. */
export type ShareHookFacts = {
  file: FilePath;
  existing: string | undefined;
  script: FilePath;
  /** The directory `core.hooksPath` sends git to, when it is set; the CLI does not write there. */
  runFromElsewhere: DirectoryPath | undefined;
  /** Whether the hook file is inside the repository, where a change to it can be committed. */
  inRepository: boolean;
};

/** What to write into the hook file, if anything, and what to tell the developer about it. */
export type ShareHookPlan = { content: string | undefined; outcome: ShareHookInstall };

/**
 * Right after the shebang of a shell hook, so an early `exit` cannot skip it; a hook git runs from
 * elsewhere, in another language, or with no shebang to tell, is left alone and the one line named.
 */
export function planShareHook(hook: ShareHookFacts): ShareHookPlan {
  const { file, existing, script } = hook;
  if (hookCallsScript(existing)) {
    return { content: undefined, outcome: { kind: 'installed', file, written: false } };
  }
  if (hook.runFromElsewhere !== undefined) {
    const steps: ShareHookStep[] = hook.inRepository ? ['addCall', 'commit'] : ['addCall'];
    return {
      content: undefined,
      outcome: { kind: 'elsewhere', file, runFrom: hook.runFromElsewhere, script, steps }
    };
  }
  if (existing === undefined || existing.trim() === '') {
    return {
      content: `${DEFAULT_SHEBANG}\n\n${SHARE_HOOK_BLOCK}\n`,
      outcome: { kind: 'installed', file, written: true }
    };
  }
  const lines = existing.split(/\r?\n/);
  const shebang = lines[0].startsWith('#!') ? lines[0] : '';
  if (!SHELL_SHEBANG.test(shebang)) {
    return { content: undefined, outcome: { kind: 'notShell', file, shebang, script, steps: ['addCall'] } };
  }
  const content = [shebang, '', SHARE_HOOK_BLOCK, '', ...lines.slice(1)].join('\n');
  return {
    content: content.endsWith('\n') ? content : `${content}\n`,
    outcome: { kind: 'installed', file, written: true }
  };
}

// ---------------------------------------------------------------------------------------------
// What recording a generation came to
// ---------------------------------------------------------------------------------------------

/** What the developer hears once a generation has been recorded, or could not be. */
export type RecordingNotice =
  /** `after` a fresh write there is no earlier record to fall back on; after a merge the one before stays. */
  | { kind: 'snapshotNotRecorded'; after: 'fresh' | 'merge'; problem: RepositoryProblem }
  | { kind: 'hookNotInstalled'; problem: RepositoryProblem }
  | { kind: 'hookNeedsOneStep'; needed: ShareHookNeedsOneStep }
  | { kind: 'hookInstalled'; file: FilePath }
  | { kind: 'nothingToSay' };

/** What recording came to, as one thing to say: the snapshot, else the hook, else the file that was written, else nothing. */
export function recordingNotice(
  recorded: Result<ShareHookInstall, RecordProblem>,
  after: 'fresh' | 'merge'
): RecordingNotice {
  if (recorded.isErr()) {
    const problem = { reason: recorded.error.reason };
    return recorded.error.step === 'snapshot'
      ? { kind: 'snapshotNotRecorded', after, problem }
      : { kind: 'hookNotInstalled', problem };
  }
  const hook = recorded.value;
  if (hook.kind !== 'installed') {
    return { kind: 'hookNeedsOneStep', needed: hook };
  }
  return hook.written ? { kind: 'hookInstalled', file: hook.file } : { kind: 'nothingToSay' };
}

// =============================================================================================
// The shell: the SDK directory on disk, and its own repository
// =============================================================================================

const git = new GitService();
const files = new FileService();
const zips = new ZipService();

const PREVIOUS_REF = SnapshotRef.previous();
const PRISTINE = SnapshotRef.pristine();

const KEPT_OUT_OF_ARCHIVE = [RelativeDirectoryPath.fromGit(GIT_DIRECTORY.toString())!, RECORD_DIRECTORY];

const RECORD_ATTRIBUTES_FILE = '.gitattributes';

/** A file operation as a `Result`, so a failing one answers with the file system's own words. */
async function onDisk<T>(work: Promise<T>): Promise<Result<T, RepositoryProblem>> {
  try {
    return ok(await work);
  } catch (error) {
    return err({ reason: errorMessage(error) });
  }
}

/** The file's bytes, or none when it is not there. */
async function bytesIfPresent(file: FilePath): Promise<Uint8Array | undefined> {
  return (await files.fileExists(file)) ? files.getBytes(file) : undefined;
}

/** The file's text, or none when it is not there. */
async function textIfPresent(file: FilePath): Promise<string | undefined> {
  return (await files.fileExists(file)) ? files.getContents(file) : undefined;
}

/** Writes the bytes unless the file already holds exactly them, so an unchanged file keeps its timestamp. */
async function putBytes(file: FilePath, content: Uint8Array): Promise<void> {
  const current = await bytesIfPresent(file);
  if (current !== undefined && Buffer.from(current).equals(content)) {
    return;
  }
  await files.writeBytes(file, content);
}

/** Removes the file and the directories it leaves empty, up to but not including `root`. */
async function removeFileAndEmptyParents(file: FilePath, root: DirectoryPath): Promise<void> {
  await files.deleteFile(file);
  await files.removeEmptyDirectories(file.directory(), root);
}

/** Writes the hook file when its content changed, executable as git needs a hook to be. */
async function writeExecutable(file: FilePath, content: string): Promise<void> {
  if (await files.replaceContentsIfChanged(file, content)) {
    await files.makeExecutable(file);
  }
}

// --- The SDK directory ------------------------------------------------------------------------

/** Whether the directory has a `.git` of its own, a folder or a worktree's file; read from disk, so a directory without one never needs git. */
export async function hasOwnGitDirectory(sdk: DirectoryPath): Promise<boolean> {
  return (
    (await files.directoryExists(sdk.join(GIT_DIRECTORY.toString()))) ||
    (await files.fileExists(new FilePath(sdk, GIT_DIRECTORY)))
  );
}

/** The root of the SDK directory's own repository, or none when a repository only encloses it from above, which is the developer's to keep. */
export async function ownRepositoryRoot(
  sdk: DirectoryPath
): Promise<Result<DirectoryPath | undefined, RepositoryProblem>> {
  if (!(await hasOwnGitDirectory(sdk))) {
    return ok(undefined);
  }
  // Spelt as git spells the root, so an 8.3 alias on Windows still compares equal.
  const real = new DirectoryPath(canonical(sdk.toString()));
  const root = await git.topLevel(real);
  return root.map((found) => (found?.isEqual(real) ? real : undefined));
}

/** Whether saving over the directory would remove anything: hidden entries such as `.github` count, only `.git` stays. */
export async function directoryHoldsFiles(sdk: DirectoryPath): Promise<boolean> {
  return files.hasEntriesExcluding(sdk, [GIT_DIRECTORY]);
}

/** Makes the SDK directory a repository of its own, creating it when it is not there yet; the root it then writes through. */
export async function initRepository(sdk: DirectoryPath): Promise<Result<DirectoryPath, RepositoryProblem>> {
  const made = await onDisk(files.createDirectoryIfNotExists(sdk));
  if (made.isErr()) {
    return err(made.error);
  }
  const initialised = await git.init(sdk);
  return initialised.map(() => sdk);
}

/** Overwrites the directory with the generated SDK; a `.git` in it is the developer's, or holds the snapshots, and stays. */
export async function saveSdk(sdk: DirectoryPath, generated: DirectoryPath): Promise<DirectoryPath> {
  await files.cleanDirectoryExcluding(sdk, [GIT_DIRECTORY]);
  await files.copyDirectoryContents(generated, sdk);
  return sdk;
}

/** The downloaded archive expanded below the temp directory, where the run reads the generation from. */
export async function unpackSdk(
  tempDirectory: DirectoryPath,
  archive: FilePath
): Promise<Result<DirectoryPath, FileProblem>> {
  const generated = tempDirectory.join('sdk-original');
  await files.createDirectoryIfNotExists(generated);
  const unpacked = await zips.unArchive(archive, generated);
  return unpacked.map(() => generated).mapErr((reason): FileProblem => ({ kind: 'unzipFailed', reason }));
}

/** The SDK zipped for upload: everything but `.git`, the CLI's record and, inside a repository of its own, what its ignore rules keep out. */
export async function archiveSdk(
  sdk: DirectoryPath,
  tempDirectory: DirectoryPath
): Promise<Result<FilePath, FileProblem | RepositoryProblem>> {
  const root = await ownRepositoryRoot(sdk);
  if (root.isErr()) {
    return err(root.error);
  }
  const ignored = root.value === undefined ? ok(NO_PATHS) : await git.ignoredBelow(root.value);
  if (ignored.isErr()) {
    return err(ignored.error);
  }
  return new TempContext(tempDirectory).zipWithout(sdk, {
    files: ignored.value.files,
    directories: [...KEPT_OUT_OF_ARCHIVE, ...ignored.value.directories]
  });
}

// --- The generation record --------------------------------------------------------------------

const recordFile = (root: DirectoryPath): FilePath =>
  new FilePath(RECORD_DIRECTORY.in(root), new FileName(RECORD_FILE));

/** The record, or none when there is no file, or not one a CLI wrote. */
async function readGenerationRecord(root: DirectoryPath): Promise<GenerationRecord | undefined> {
  const json = await textIfPresent(recordFile(root));
  return json === undefined ? undefined : GenerationRecord.parse(json);
}

/** The record and the attributes that keep git from writing markers into it, each only when its content changed. */
async function writeGenerationRecord(root: DirectoryPath, record: GenerationRecord): Promise<void> {
  const attributes = new FilePath(RECORD_DIRECTORY.in(root), new FileName(RECORD_ATTRIBUTES_FILE));
  await files.replaceContentsIfChanged(attributes, RECORD_ATTRIBUTES);
  await files.replaceContentsIfChanged(recordFile(root), record.toJson());
}

// --- Inspecting the repository ----------------------------------------------------------------

/** Every local fact the state is decided from, read before any of them is weighed; the remote is where the branch pushes, else `origin`. */
async function readRepositoryFacts(root: DirectoryPath): Promise<Result<RepositoryFacts, RepositoryProblem>> {
  const remote = await git.remoteOf(root);
  if (remote.isErr()) {
    return err(remote.error);
  }
  const operation = await git.operationInProgress(root);
  if (operation.isErr()) {
    return err(operation.error);
  }
  const stages = await git.unmergedStages(root);
  if (stages.isErr()) {
    return err(stages.error);
  }
  const record = await onDisk(readGenerationRecord(root));
  if (record.isErr()) {
    return err(record.error);
  }
  const baseHere = record.value === undefined ? ok(false) : await git.hasCommit(root, record.value.pristineCommit());
  if (baseHere.isErr()) {
    return err(baseHere.error);
  }
  return ok({
    root,
    operation: operation.value,
    unresolved: new ValueSet(stages.value.map((entry) => entry.path)).values(),
    record: record.value,
    baseHere: baseHere.value,
    remote: remote.value
  });
}

/** Both tips and how they relate, read before anything is decided about them. */
async function readChainFacts(
  root: DirectoryPath,
  remoteTip: CommitId
): Promise<Result<ChainFacts, RepositoryProblem>> {
  const local = await git.resolveRef(root, PRISTINE);
  if (local.isErr()) {
    return err(local.error);
  }
  if (local.value === undefined) {
    return ok({ local: undefined, remote: remoteTip, localContinuesToRemote: false, remoteBehindLocal: false });
  }
  const continues = await git.isAncestor(root, local.value, remoteTip);
  if (continues.isErr()) {
    return err(continues.error);
  }
  const behind = await git.isAncestor(root, remoteTip, local.value);
  if (behind.isErr()) {
    return err(behind.error);
  }
  return ok({
    local: local.value,
    remote: remoteTip,
    localContinuesToRemote: continues.value,
    remoteBehindLocal: behind.value
  });
}

/** A two-parent commit over the local tip's tree, so the chain carries both machines' generations. */
async function joinChains(
  root: DirectoryPath,
  localTip: CommitId,
  remoteTip: CommitId
): Promise<Result<void, RepositoryProblem>> {
  const tree = await git.treeOfCommit(root, localTip);
  if (tree.isErr()) {
    return err(tree.error);
  }
  const joined = await git.commitTree(root, tree.value, [localTip, remoteTip], 'apimatic: pristine chains joined');
  if (joined.isErr()) {
    return err(joined.error);
  }
  return git.updateRef(root, PRISTINE, joined.value);
}

/** The remote's pristine chain brought over and met with the local one, as `reconcile` decides. */
async function fetchPristineChain(root: DirectoryPath, remote: RemoteName): Promise<Result<void, RepositoryProblem>> {
  const remoteTip = await git.fetchRef(root, remote, PRISTINE);
  if (remoteTip.isErr()) {
    return err(remoteTip.error);
  }
  if (remoteTip.value === undefined) {
    return ok(undefined);
  }
  const chains = await readChainFacts(root, remoteTip.value);
  if (chains.isErr()) {
    return err(chains.error);
  }
  const decided = reconcile(chains.value);
  switch (decided.kind) {
    case 'adopt':
      return git.updateRef(root, PRISTINE, remoteTip.value);
    case 'keep':
      return ok(undefined);
    case 'join':
      return joinChains(root, decided.local, decided.remote);
  }
}

/** What a run needs before it decides how to write: the local facts, read then classified, and one fetch when the recorded base is elsewhere. */
export async function inspectRepository(
  root: DirectoryPath,
  generation: SdkGeneration
): Promise<Result<SdkRepositoryState, InspectionProblem>> {
  const facts = await readRepositoryFacts(root);
  if (facts.isErr()) {
    return err(facts.error);
  }
  const classified = classify(facts.value, generation);
  if (classified.isErr()) {
    return err(classified.error);
  }
  if (classified.value.kind !== 'fetchNeeded') {
    return ok(classified.value);
  }
  const needed = classified.value;
  const fetched = await fetchPristineChain(root, needed.remote);
  if (fetched.isErr()) {
    return ok(afterFetch(needed, { kind: 'failed', reason: fetched.error.reason }));
  }
  const brought = await git.hasCommit(root, needed.base);
  if (brought.isErr()) {
    return err(brought.error);
  }
  return ok(afterFetch(needed, { kind: 'fetched', baseHere: brought.value }));
}

/** How the run will write the SDK directory, carrying the repository root it writes through where there is one. */
export type Found = SdkDestination<DirectoryPath> | Unresolved<DirectoryPath>;

/**
 * How a run will write the directory, from git and the SDK directory's own repository; nothing is asked here.
 * Git is looked for only when the directory has a repository of its own or `gitInit` will make it one.
 */
export async function inspectSdkDirectory(
  sdk: DirectoryPath,
  generation: SdkGeneration,
  gitInit: boolean
): Promise<Result<Found, InspectionProblem>> {
  const ownGit = await hasOwnGitDirectory(sdk);
  if (!gitInit && !ownGit) {
    return ok({ kind: 'noRepository' });
  }
  const version = await git.version();
  if (version.isErr()) {
    return err(version.error);
  }
  if (version.value === undefined || !version.value.isSupported()) {
    return ok({ kind: 'overwrite', found: version.value });
  }
  const root = ownGit ? await ownRepositoryRoot(sdk) : ok(undefined);
  if (root.isErr()) {
    return err(root.error);
  }
  if (root.value === undefined) {
    return ok({ kind: 'noRepository' });
  }
  const repository = root.value;
  const state = await inspectRepository(repository, generation);
  return state.map((found) => destinationFor(repository, found));
}

// --- Settling what the last run left --------------------------------------------------------

/** Settles the remaining conflicts in `paths` for `side` from the index's two sides and the files as they are, and takes them out of the unmerged state. */
export async function settleUnresolvedFiles(
  root: DirectoryPath,
  side: ConflictSide,
  paths: readonly RelativeFilePath[]
): Promise<Result<void, RepositoryProblem>> {
  const stages = await git.unmergedStages(root);
  if (stages.isErr()) {
    return err(stages.error);
  }
  const blobs = await git.readBlobs(
    root,
    stages.value.map((entry) => entry.oid)
  );
  if (blobs.isErr()) {
    return err(blobs.error);
  }
  for (const path of paths) {
    const sideOf = (stage: StageEntry['stage']) => {
      const entry = stages.value.find((candidate) => candidate.stage === stage && candidate.path.isEqual(path));
      return entry === undefined ? undefined : blobs.value.get(entry.oid);
    };
    const file = path.in(root);
    const disk = await onDisk(bytesIfPresent(file));
    if (disk.isErr()) {
      return err(disk.error);
    }
    const settled = settledContent(side, {
      disk: disk.value,
      yours: sideOf(SIDE_STAGE.yours),
      generated: sideOf(SIDE_STAGE.generated)
    });
    if (settled === disk.value) {
      continue;
    }
    const written = await onDisk(
      settled === undefined ? files.deleteFile(file) : putBytes(file, lineEndingFor(settled, disk.value))
    );
    if (written.isErr()) {
      return err(written.error);
    }
  }
  return git.unstage(root, paths);
}

// --- Snapshots --------------------------------------------------------------------------------

/** Every path `base` holds, so a snapshot of the disk takes a generated file in even where an ignore rule matches it. */
async function pathsHeldBy(
  root: DirectoryPath,
  base: CommitId
): Promise<Result<RelativeFilePath[], RepositoryProblem>> {
  const entries = await git.listTree(root, base);
  return entries.map((found) => found.map((entry) => entry.path));
}

/** Records `generated` as the next pristine snapshot, chained on the last one; an identical generation keeps the last. */
export async function recordPristineSnapshot(
  root: DirectoryPath,
  generated: TreeId,
  generation: SdkGeneration
): Promise<Result<CommitId, RepositoryProblem>> {
  const parent = await git.resolveRef(root, PRISTINE);
  if (parent.isErr()) {
    return err(parent.error);
  }
  if (parent.value !== undefined) {
    const tree = await git.treeOfCommit(root, parent.value);
    if (tree.isErr()) {
      return err(tree.error);
    }
    if (tree.value.isEqual(generated)) {
      return ok(parent.value);
    }
  }
  const commit = await git.commitTree(
    root,
    generated,
    parent.value === undefined ? [] : [parent.value],
    `apimatic: pristine ${generation}`
  );
  if (commit.isErr()) {
    return err(commit.error);
  }
  const updated = await git.updateRef(root, PRISTINE, commit.value);
  return updated.map(() => commit.value);
}

/** Keeps the SDK directory as it is on disk, byte for byte, replacing what the last run kept, so a merge can be undone. */
async function savePreviousSnapshot(root: DirectoryPath, base: CommitId): Promise<Result<CommitId, RepositoryProblem>> {
  const including = await pathsHeldBy(root, base);
  if (including.isErr()) {
    return err(including.error);
  }
  const disk = await git.tree(root, { kind: 'workingTree', including: including.value }, 'asIs');
  if (disk.isErr()) {
    return err(disk.error);
  }
  const commit = await git.commitTree(root, disk.value, [], 'apimatic: before regeneration');
  if (commit.isErr()) {
    return err(commit.error);
  }
  const updated = await git.updateRef(root, PREVIOUS_REF, commit.value);
  return updated.map(() => commit.value);
}

// --- Recording a generation -------------------------------------------------------------------

/** The script into git's own hooks directory, and the block that calls it into the hook git runs, as `planShareHook` decides. */
async function installShareHook(root: DirectoryPath): Promise<Result<ShareHookInstall, RepositoryProblem>> {
  const hooks = await git.hooksDirectory(root);
  if (hooks.isErr()) {
    return err(hooks.error);
  }
  const script = new FilePath(hooks.value, new FileName(SHARE_HOOK_SCRIPT_NAME));
  const scriptWritten = await onDisk(writeExecutable(script, SHARE_HOOK_SCRIPT));
  if (scriptWritten.isErr()) {
    return err(scriptWritten.error);
  }
  const hooksPath = await git.hooksPathConfigured(root);
  if (hooksPath.isErr()) {
    return err(hooksPath.error);
  }
  const runFromElsewhere = hooksPath.value === undefined ? ok(undefined) : await git.hooksRunFrom(root);
  if (runFromElsewhere.isErr()) {
    return err(runFromElsewhere.error);
  }
  const file = hookFileIn(runFromElsewhere.value ?? hooks.value);
  const existing = await onDisk(textIfPresent(file));
  if (existing.isErr()) {
    return err(existing.error);
  }
  const plan = planShareHook({
    file,
    existing: existing.value,
    script,
    runFromElsewhere: runFromElsewhere.value,
    inRepository: root.contains(file.directory())
  });
  if (plan.content === undefined) {
    return ok(plan.outcome);
  }
  const written = await onDisk(writeExecutable(file, plan.content));
  return written.map(() => plan.outcome);
}

/**
 * Records `generated` for the next run: the pristine snapshot first, then the record naming it, so the
 * two never disagree, then the block that shares snapshots in the `pre-push` hook, where git runs hooks from.
 */
export async function recordGeneration(
  root: DirectoryPath,
  generated: TreeId,
  generation: SdkGeneration
): Promise<Result<ShareHookInstall, RecordProblem>> {
  const pristine = await recordPristineSnapshot(root, generated, generation);
  if (pristine.isErr()) {
    return err({ step: 'snapshot', reason: pristine.error.reason });
  }
  const written = await onDisk(writeGenerationRecord(root, GenerationRecord.written(generation, pristine.value)));
  if (written.isErr()) {
    return err({ step: 'snapshot', reason: written.error.reason });
  }
  const hook = await installShareHook(root);
  return hook.mapErr((problem) => ({ step: 'hook', reason: problem.reason }));
}

/** A freshly written SDK recorded as the next base: snapshotted whole, then recorded as `recordGeneration` does. */
export async function recordGeneratedDirectory(
  root: DirectoryPath,
  generated: DirectoryPath,
  generation: SdkGeneration
): Promise<Result<ShareHookInstall, RecordProblem>> {
  const tree = await git.tree(root, { kind: 'everyFileIn', directory: generated }, 'normalized');
  if (tree.isErr()) {
    return err({ step: 'snapshot', reason: tree.error.reason });
  }
  return recordGeneration(root, tree.value, generation);
}

// --- The merge --------------------------------------------------------------------------------

/** Both trees snapshotted, then merged against `base` by git, into the plan of what to write. */
export async function mergeRegeneration(
  root: DirectoryPath,
  base: CommitId,
  generatedDirectory: DirectoryPath
): Promise<Result<Regeneration, RepositoryProblem>> {
  const generated = await git.tree(root, { kind: 'everyFileIn', directory: generatedDirectory }, 'normalized');
  if (generated.isErr()) {
    return err(generated.error);
  }
  const basePaths = await pathsHeldBy(root, base);
  if (basePaths.isErr()) {
    return err(basePaths.error);
  }
  const disk = await git.tree(root, { kind: 'workingTree', including: basePaths.value }, 'normalized');
  if (disk.isErr()) {
    return err(disk.error);
  }
  const baseTree = await git.treeOfCommit(root, base);
  if (baseTree.isErr()) {
    return err(baseTree.error);
  }
  const yours = await git.commitTree(root, disk.value, [base], 'apimatic: your changes');
  if (yours.isErr()) {
    return err(yours.error);
  }
  const theirs = await git.commitTree(root, generated.value, [base], 'apimatic: generated');
  if (theirs.isErr()) {
    return err(theirs.error);
  }
  // Yours is git's "ours" and the generation its "theirs", which is what `SIDE_STAGE` reads the stages by.
  const merged = await git.mergeTree(root, yours.value, theirs.value);
  if (merged.isErr()) {
    return err(merged.error);
  }
  const yourChanges = await git.diff(root, baseTree.value, disk.value, 'paired');
  if (yourChanges.isErr()) {
    return err(yourChanges.error);
  }
  const generatedChanges = await git.diff(root, baseTree.value, generated.value, 'paired');
  if (generatedChanges.isErr()) {
    return err(generatedChanges.error);
  }
  const applied = await git.diff(root, disk.value, merged.value.tree, 'unpaired');
  if (applied.isErr()) {
    return err(applied.error);
  }
  const plan = MergePlan.from({
    merge: merged.value,
    yours: yourChanges.value.filter((change) => !isRecordPath(change.path)),
    generated: generatedChanges.value,
    applied: applied.value,
    basePaths: basePaths.value
  });
  return ok({ generated: generated.value, merge: { plan, stages: merged.value.stages } });
}

/** The files `touched` put back as the previous snapshot holds them, or removed where it has none. */
async function restoreFromSnapshot(
  root: DirectoryPath,
  previous: CommitId,
  touched: readonly RelativeFilePath[]
): Promise<Result<void, RepositoryProblem>> {
  const entries = await git.listTree(root, previous);
  if (entries.isErr()) {
    return err(entries.error);
  }
  const kept = new ValueMap(entries.value.map((entry): [RelativeFilePath, BlobId] => [entry.path, entry.oid]));
  const blobs = await git.readBlobs(
    root,
    touched.flatMap((relative) => kept.get(relative) ?? [])
  );
  if (blobs.isErr()) {
    return err(blobs.error);
  }
  for (const relative of touched) {
    const oid = kept.get(relative);
    const restored = await onDisk(
      oid === undefined
        ? removeFileAndEmptyParents(relative.in(root), root)
        : putBytes(relative.in(root), blobs.value.get(oid)!)
    );
    if (restored.isErr()) {
      return err(restored.error);
    }
  }
  return ok(undefined);
}

/** The step that failed named, with what came before it put back from the previous snapshot, or that snapshot named when it could not be. */
async function notApplied(
  root: DirectoryPath,
  previous: CommitId,
  step: { path: RelativeFilePath; operation: NotApplied['operation']; failure: RepositoryProblem },
  touched: readonly RelativeFilePath[]
): Promise<NotApplied> {
  const restored = await restoreFromSnapshot(root, previous, touched);
  return {
    kind: 'notApplied',
    file: step.path.in(root),
    operation: step.operation,
    reason: step.failure.reason,
    undo: restored.match(
      () => ({ kind: 'done' }),
      (problem) => ({ kind: 'failed', reason: problem.reason, previous: PREVIOUS_REF })
    )
  };
}

/** Removals before writes, so a case-only rename lands on a filesystem that ignores case; a failed step puts back what came before it. */
async function landPlan(
  root: DirectoryPath,
  plan: MergePlan,
  generated: DirectoryPath,
  previous: CommitId
): Promise<Result<void, WriteProblem>> {
  const blobs = await git.readBlobs(
    root,
    plan.writes.map((write) => write.blob)
  );
  if (blobs.isErr()) {
    return err(blobs.error);
  }
  const touched: RelativeFilePath[] = [];
  for (const path of plan.deletes) {
    touched.push(path);
    const removed = await onDisk(removeFileAndEmptyParents(path.in(root), root));
    if (removed.isErr()) {
      return err(await notApplied(root, previous, { path, operation: 'remove', failure: removed.error }, touched));
    }
  }
  for (const write of plan.writes) {
    touched.push(write.path);
    const file = write.path.in(root);
    const written = await onDisk(
      (async () => {
        const samples = [await bytesIfPresent(file), await bytesIfPresent(write.path.in(generated))];
        await putBytes(file, contentToWrite(write, plan.hasMarkers(write.path), blobs.value.get(write.blob)!, samples));
      })()
    );
    if (written.isErr()) {
      return err(
        await notApplied(root, previous, { path: write.path, operation: 'write', failure: written.error }, touched)
      );
    }
  }
  return ok(undefined);
}

/** The previous ref first, then the plan onto the disk; a step that fails is undone from that ref, which stays for a restore by hand. */
export async function writeRegeneration(
  root: DirectoryPath,
  base: CommitId,
  plan: MergePlan,
  generated: DirectoryPath
): Promise<Result<void, WriteProblem>> {
  const previous = await savePreviousSnapshot(root, base);
  if (previous.isErr()) {
    return err(previous.error);
  }
  return landPlan(root, plan, generated, previous.value);
}

// =============================================================================================
// The run
// =============================================================================================

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly sdkGenerationService: SdkGenerationService = new SdkGenerationService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    project: ProjectContext,
    sdk: DirectoryPath,
    requested: GenerationRequest,
    run: RunMode,
    packageSettingsDirectory?: DirectoryPath
  ): Promise<ActionResult> => {
    if (!isAvailableLanguage(requested.language)) {
      this.prompts.languageNotAvailable(requested.language);
      return ActionResult.failed();
    }
    const generation = SdkGeneration.create(requested);
    if (generation === undefined) {
      this.prompts.generationNotOffered(requested);
      return ActionResult.failed();
    }
    const sourceDirectory = project.sourceDirectory();
    // The SDK directory is emptied before the SDK is written, so one holding the source would delete it.
    if (project.isSourceWithin(sdk)) {
      this.prompts.destinationContainsSource(sourceDirectory, sdk);
      return ActionResult.failed();
    }
    if (!(await project.sourceExists())) {
      this.prompts.sourceDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }
    if (!(await project.specsExist())) {
      this.prompts.specDirectoryEmpty(sourceDirectory);
      return ActionResult.failed();
    }

    const inspected = await inspectSdkDirectory(sdk, generation, run.gitInit);
    const onConflict = onConflictFor(run);
    const unresolved =
      inspected.isOk() && inspected.value.kind === 'unresolved' && onConflict !== 'refuse'
        ? inspected.value
        : undefined;
    if (unresolved !== undefined) {
      const choice = onConflict === 'ask' ? await this.prompts.unresolvedChoice(unresolved.paths, sdk) : 'generated';
      if (choice === 'resolve' || choice === 'cancel') {
        this.prompts.resolveLater();
        return choice === 'resolve' ? ActionResult.actionRequired() : ActionResult.cancelled();
      }
      const settled = await settleUnresolvedFiles(unresolved.repository, choice, unresolved.paths);
      if (settled.isErr()) {
        this.prompts.conflictsNotSettled(settled.error);
        return ActionResult.failed();
      }
      this.prompts.conflictsResolved(choice, unresolved.paths, sdk);
    }
    const looked = unresolved === undefined ? inspected : await inspectSdkDirectory(sdk, generation, run.gitInit);
    if (looked.isErr()) {
      this.prompts.directoryNotInspected(looked.error);
      return ActionResult.failed();
    }
    // Left unresolved by a run that could not ask, or by a settling that did not clear every file.
    if (looked.value.kind === 'unresolved') {
      this.prompts.conflictsUnresolved(looked.value.paths, sdk);
      return ActionResult.actionRequired();
    }
    const destination = looked.value;
    const notice = noticeFor(destination);
    if (notice !== undefined) {
      this.prompts.destinationNotice(notice);
    }
    const mode = writeModeFor(destination, run, await directoryHoldsFiles(sdk));
    if (mode.kind === 'refuse') {
      this.prompts.refused(mode.because, sdk);
      return ActionResult.failed();
    }
    if (mode.confirmOverwrite && !(await this.prompts.overwriteSdk(sdk))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory): Promise<ActionResult> => {
      const build = await project.buildZip(tempDirectory, packageSettingsDirectory);
      if (build.isErr()) {
        this.prompts.srcDirNotZipped(sourceDirectory, build.error);
        return ActionResult.failed();
      }
      const response = await this.prompts.generateSdk(
        this.sdkGenerationService.generateSdk(
          build.value,
          generation.language,
          generation.stability,
          this.configDir,
          this.commandMetadata,
          this.authKey
        )
      );
      if (response.isErr()) {
        this.prompts.sdkGenerationServiceError(response.error);
        return ActionResult.failed();
      }
      const archive = await new TempContext(tempDirectory).save(response.value);
      const unpacked = await unpackSdk(tempDirectory, archive);
      if (unpacked.isErr()) {
        this.prompts.sdkNotUnzipped(unpacked.error);
        return ActionResult.failed();
      }
      const generated = unpacked.value;

      switch (mode.kind) {
        case 'save': {
          const saved = await saveSdk(sdk, generated);
          this.prompts.sdkGenerated(saved);
          if (mode.suggestGitInit) {
            this.prompts.gitInitSteps(saved);
          }
          return ActionResult.success();
        }
        case 'init':
        case 'record': {
          const root = mode.kind === 'init' ? await initRepository(sdk) : ok(mode.repository);
          if (root.isErr()) {
            this.prompts.repositoryNotInitialised(sdk, root.error);
            return ActionResult.failed();
          }
          await saveSdk(sdk, generated);
          if (mode.kind === 'init') {
            this.prompts.repositoryInitialised(sdk);
          } else if (mode.announceRepository) {
            this.prompts.repositoryFound(sdk);
          } else if (mode.warnReplacedRecord) {
            this.prompts.recordedSdkReplaced(sdk);
          }
          const recorded = await recordGeneratedDirectory(root.value, generated, generation);
          this.prompts.recorded(recordingNotice(recorded, 'fresh'));
          this.prompts.sdkGenerated(sdk);
          return ActionResult.success();
        }
        case 'merge': {
          const { repository, base } = mode;
          const regenerated = await mergeRegeneration(repository, base, generated);
          if (regenerated.isErr()) {
            this.prompts.customCodeFailed(regenerated.error);
            return ActionResult.failed();
          }
          const regeneration = regenerated.value;
          const { plan } = regeneration.merge;
          if (plan.hasConflicts() && mode.onConflict === 'refuse') {
            this.prompts.conflictsNotAsked(plan, sdk);
            return ActionResult.failed();
          }
          const choice = !plan.hasConflicts()
            ? 'resolve'
            : mode.onConflict === 'ask'
            ? await this.prompts.conflictChoice(plan, sdk)
            : 'generated';
          if (choice === 'cancel') {
            this.prompts.runCancelled(sdk);
            return ActionResult.cancelled();
          }
          const settlement = settle(regeneration, choice);
          const written = await writeRegeneration(repository, base, settlement.plan, generated);
          if (written.isErr()) {
            if ('kind' in written.error) {
              this.prompts.sdkNotWritten(sdk, written.error);
            } else {
              this.prompts.customCodeFailed(written.error);
            }
            return ActionResult.failed();
          }
          const recorded = await recordGeneration(repository, regeneration.generated, generation);
          this.prompts.recorded(recordingNotice(recorded, 'merge'));
          if (settlement.settled !== undefined) {
            this.prompts.conflictsResolved(settlement.settled.side, settlement.settled.paths, sdk);
          }
          this.prompts.sdkMerged(sdk, settlement.plan);
          if (!settlement.plan.hasConflicts()) {
            return ActionResult.success();
          }
          const staged = await git.stageConflicts(repository, regeneration.merge.stages);
          if (staged.isErr()) {
            this.prompts.conflictsNotStaged(staged.error);
          }
          this.prompts.conflictSteps(settlement.plan, sdk, staged.isOk());
          return ActionResult.actionRequired();
        }
      }
    });
  };
}
