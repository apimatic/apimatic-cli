import { CommitId } from '../git/commit-id.js';
import { GitVersion } from '../git/git-version.js';
import { SnapshotFetch } from './repository-state.js';
import { replacesDirectory, SdkDestination, Unresolved } from './sdk-destination.js';

/** Whether the run may put a question to the developer, decided once by the command that started it. */
export type Interaction = 'ask' | 'never';

/** How the run was started: whether it may ask, whether `--force` answers for it, and whether `--git-init` was given. */
export type RunMode = { force: boolean; interaction: Interaction; gitInit: boolean };

/** What the developer hears about the destination before anything is uploaded. */
export type DestinationNotice =
  | { kind: 'gitUnavailable'; found: GitVersion | undefined }
  | { kind: 'snapshotMissing'; fetch: SnapshotFetch };

/** Why a run stops before generating: the overwrite question with no one to answer it. */
export type WriteRefusal = { kind: 'cannotAskToOverwrite' };

/** What happens when files conflict: the developer is asked, `--force` takes the generator's side, or the run stops. */
export type OnConflict = 'ask' | 'generated' | 'refuse';

/** How the run writes the SDK directory, with the one question each way may still need. */
export type WriteMode<Repository> =
  | { kind: 'refuse'; because: WriteRefusal }
  /** Replace the directory; `warnNoRepository` when no repository will keep the developer's edits. */
  | { kind: 'save'; confirmOverwrite: boolean; warnNoRepository: boolean }
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

/** How the run meets conflicts, this run's or the last run's: a terminal run asks, and any other run stops unless `--force` answers. */
export function onConflictFor(run: RunMode): OnConflict {
  if (run.force) {
    return 'generated';
  }
  return run.interaction === 'ask' ? 'ask' : 'refuse';
}

/**
 * The run's write mode from its destination and how it was started. Emptying a non-empty directory
 * is confirmed unless `--force` answers; a run that cannot ask stops where it would have had to.
 */
export function writeModeFor<Repository>(
  destination: SdkDestination<Repository>,
  run: RunMode,
  directoryExists: boolean
): WriteMode<Repository> {
  const confirmOverwrite = !run.force && directoryExists && replacesDirectory(destination);
  if (confirmOverwrite && run.interaction === 'never') {
    return { kind: 'refuse', because: { kind: 'cannotAskToOverwrite' } };
  }
  switch (destination.kind) {
    case 'overwrite':
      return { kind: 'save', confirmOverwrite, warnNoRepository: false };
    case 'noRepository':
      return run.gitInit
        ? { kind: 'init', confirmOverwrite }
        : { kind: 'save', confirmOverwrite, warnNoRepository: true };
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
