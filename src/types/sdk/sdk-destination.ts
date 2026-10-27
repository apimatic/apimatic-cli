import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { GitVersion } from '../git/git-version.js';
import { SdkRepositoryContext } from '../sdk-repository-context.js';
import { SdkRepositoryState } from './repository-state.js';

/** Why a run records a fresh snapshot instead of merging: there is no base, or not one for this generation. */
export type RecordReason = { kind: 'noRepository' } | Exclude<SdkRepositoryState, { kind: 'ready' | 'unresolved' }>;

/**
 * How a run will write the SDK directory, decided before anything is uploaded, with the reason
 * the developer is told: replaced as today, when git cannot keep anything; replaced and then
 * recorded, so the next run has a base; or merged over the developer's changes against the
 * base the generation record names.
 */
export type SdkDestination =
  | { kind: 'overwrite'; found: GitVersion | undefined }
  | { kind: 'record'; repository: SdkRepositoryContext | undefined; because: RecordReason }
  | { kind: 'merge'; repository: SdkRepositoryContext; base: CommitId };

/** The last run's markers are still in the files; nothing is decided until the developer settles them. */
export type Unresolved = { kind: 'unresolved'; repository: SdkRepositoryContext; paths: readonly RelativeFilePath[] };

export function destinationFor(
  repository: SdkRepositoryContext,
  state: SdkRepositoryState
): SdkDestination | Unresolved {
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
export function replacesDirectory(destination: SdkDestination): boolean {
  return destination.kind !== 'merge';
}
