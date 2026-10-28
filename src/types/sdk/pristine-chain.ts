import { CommitId } from '../git/commit-id.js';

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
