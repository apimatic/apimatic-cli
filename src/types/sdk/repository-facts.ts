import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../file/directoryPath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { GitOperation } from '../git/git-operation.js';
import { RemoteName } from '../git/remote-name.js';
import { GenerationRecord, SdkGeneration } from './generation-record.js';
import { InspectionRefusal, NestedSdkDirectory, SdkRepositoryState } from './repository-state.js';

/** What the repository says about its SDK directory, every fact read before any of them is weighed. */
export type RepositoryFacts = {
  root: DirectoryPath;
  /** A merge, rebase, cherry-pick or revert of the developer's own, mid-way. */
  operation: GitOperation | undefined;
  /** Another SDK directory with snapshots above or below this one. */
  nested: NestedSdkDirectory | undefined;
  /** The paths below the SDK directory git still holds as unmerged. */
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
 * What the facts mean, in the order they matter: an operation in progress or a nested SDK is
 * refused, unmerged files come first, then the record, then whether its base is here or must be fetched.
 */
export function classify(
  facts: RepositoryFacts,
  generation: SdkGeneration
): Result<SdkRepositoryState | FetchNeeded, InspectionRefusal> {
  if (facts.operation !== undefined) {
    return err({ kind: 'operationInProgress', operation: facts.operation, root: facts.root });
  }
  if (facts.nested !== undefined) {
    return err(facts.nested);
  }
  if (facts.unresolved.length > 0) {
    return ok({ kind: 'unresolved', paths: [...facts.unresolved] });
  }
  if (facts.record === undefined) {
    return ok({ kind: 'noRecord' });
  }
  if (!facts.record.isFor(generation)) {
    return ok({ kind: 'otherGeneration', recorded: facts.record.generatedAs() });
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
