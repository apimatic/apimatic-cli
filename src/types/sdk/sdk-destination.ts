import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { GitVersion } from '../git/git-version.js';
import { SdkRepositoryState } from './repository-state.js';

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

/** What a run found before deciding: the git on PATH, and the state of the SDK directory's own repository when a supported git found one. */
export type Inspected<Repository = undefined> = {
  git: GitVersion | undefined;
  repository: { handle: Repository; state: SdkRepositoryState } | undefined;
};

/** Without a git that can merge the run overwrites; without a repository it has none to record in; else the state decides. */
export function destinationFor<Repository>({
  git,
  repository
}: Inspected<Repository>): SdkDestination<Repository> | Unresolved<Repository> {
  if (!git?.isSupported()) {
    return { kind: 'overwrite', found: git };
  }
  if (repository === undefined) {
    return { kind: 'noRepository' };
  }
  const { handle, state } = repository;
  switch (state.kind) {
    case 'ready':
      return { kind: 'merge', repository: handle, base: state.base };
    case 'unresolved':
      return { kind: 'unresolved', repository: handle, paths: state.paths };
    case 'noRecord':
    case 'otherGeneration':
    case 'snapshotMissing':
      return { kind: 'record', repository: handle, because: state };
  }
}

/** Whether the run empties the directory first, which is what the overwrite question is about. */
export function replacesDirectory(destination: SdkDestination<unknown>): boolean {
  return destination.kind !== 'merge';
}
