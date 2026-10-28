import { DirectoryPath } from '../file/directoryPath.js';
import { FilePath } from '../file/filePath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { GitOperation } from '../git/git-operation.js';
import { StageEntry } from '../git/merge-tree.js';
import { RemoteName } from '../git/remote-name.js';
import { TreeId } from '../git/tree-id.js';
import { SdkGeneration } from './generation-record.js';
import { MergePlan } from './merge-plan.js';
import { SnapshotRef } from './snapshot-ref.js';

/** A file the run could not write or remove; what it had changed is put back from the previous snapshot, else that snapshot is named. */
export type NotApplied = {
  kind: 'notApplied';
  file: FilePath;
  operation: 'write' | 'remove';
  reason: string;
  undo: { kind: 'done' } | { kind: 'failed'; reason: string; previous: SnapshotRef };
};

/** Why a git or file operation did not happen, in git's or the file system's own words. */
export type RepositoryProblem = { reason: string };

/** A write that stopped at a file, or one that did not start. */
export type WriteProblem = NotApplied | RepositoryProblem;

/** Two SDK directories, one inside the other: refs are files, so only one can have snapshots; `encloses` says the other is the outer one. */
export type NestedSdkDirectory = { kind: 'nestedSdkDirectory'; other: DirectoryPath; encloses: boolean };

/** The repository is in the middle of a git operation of the developer's own, which a run must not merge over. */
export type OperationInProgress = { kind: 'operationInProgress'; operation: GitOperation; root: DirectoryPath };

/** Why a run could not find out how to write the SDK directory: a refusal it can name, or git's own words. */
export type InspectionProblem = NestedSdkDirectory | OperationInProgress | RepositoryProblem;

/** Why a recorded snapshot is still absent after the one place it could have come from was tried. */
export type SnapshotFetch =
  | { kind: 'noRemote' }
  | { kind: 'absent'; remote: RemoteName }
  | { kind: 'failed'; remote: RemoteName; reason: string };

/** What the repository knows about its SDK directory before a run, from the record and the refs. */
export type SdkRepositoryState =
  | { kind: 'noRecord' }
  | { kind: 'otherGeneration'; recorded: SdkGeneration }
  | { kind: 'snapshotMissing'; fetch: SnapshotFetch }
  | { kind: 'unresolved'; paths: RelativeFilePath[] }
  | { kind: 'ready'; base: CommitId };

/**
 * The hook runs the script (`written` when this run put the call there), or the one line to add
 * to `file`: because git runs hooks from `hooksPath`, or because the hook there is not a shell script.
 */
export type ShareHookInstall =
  | { kind: 'installed'; file: FilePath; written: boolean }
  | { kind: 'elsewhere'; file: FilePath; hooksPath: string; inRepository: boolean; script: FilePath }
  | { kind: 'notShell'; file: FilePath; shebang: string; script: FilePath };

/** Which step of recording a generation did not happen, in git's or the file system's words: the snapshot with its record, or the hook that shares them. */
export type RecordProblem = { step: 'snapshot' | 'hook'; reason: string };

/** The plan, and git's versions of every conflicted path, below the SDK directory. */
export type MergeOutcome = { plan: MergePlan; stages: StageEntry[] };

/** A fresh generation merged over the directory as it is: the snapshot it will be recorded as, and the merge. */
export type Regeneration = { generated: TreeId; merge: MergeOutcome };
