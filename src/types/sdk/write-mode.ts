import { CommitId } from '../git/commit-id.js';
import { GitVersion } from '../git/git-version.js';
import { SdkGeneration } from './sdk-generation.js';
import { SnapshotFetch } from './repository-state.js';
import { replacesDirectory, SdkDestination, Unresolved } from './sdk-destination.js';

/** Whether the run may put a question to the developer, decided once by the command that started it. */
export type Interaction = 'ask' | 'never';

/** How the run was started: whether it may ask, and whether `--force` answers for it. */
export type RunMode = { force: boolean; interaction: Interaction };

/** What the developer hears about the destination before anything is uploaded. */
export type DestinationNotice =
  | { kind: 'gitUnavailable'; found: GitVersion | undefined }
  | { kind: 'otherGeneration'; recorded: SdkGeneration }
  | { kind: 'snapshotMissing'; fetch: SnapshotFetch };

/** Why a run stops before generating: `--force` over a recorded SDK with no base to merge against, or a question with no one to answer it. */
export type WriteRefusal =
  | { kind: 'recordedNotReplaced' }
  | { kind: 'cannotAsk'; question: 'overwrite' | 'createRepository' };

/** What happens when the merge has conflicts: the developer is asked, markers are left for them, or the run stops. */
export type OnConflict = 'ask' | 'markers' | 'refuse';

/** How the run writes the SDK directory, with the one question each way may still need. */
export type WriteMode<Repository> =
  | { kind: 'refuse'; because: WriteRefusal }
  /** Replace the directory; `warnNoRepository` when no repository will keep the developer's edits. */
  | { kind: 'save'; confirmOverwrite: boolean; warnNoRepository: boolean }
  /** Make the directory a repository of its own, then record. */
  | { kind: 'init'; confirmOverwrite: boolean }
  | { kind: 'record'; repository: Repository; confirmOverwrite: boolean }
  | { kind: 'merge'; repository: Repository; base: CommitId; confirmOverwrite: false; onConflict: OnConflict };

/** A mode, or the question whose answer picks between two: whether to make the directory a repository. */
export type ProposedMode<Repository> = WriteMode<Repository> | { kind: 'askToCreate'; confirmOverwrite: boolean };

/** What the destination means for the developer, before the run decides anything about writing. */
export function noticeFor(destination: SdkDestination<unknown> | Unresolved<unknown>): DestinationNotice | undefined {
  if (destination.kind === 'overwrite') {
    return { kind: 'gitUnavailable', found: destination.found };
  }
  if (destination.kind === 'record' && destination.because.kind === 'otherGeneration') {
    return { kind: 'otherGeneration', recorded: destination.because.recorded };
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
  directoryExists: boolean
): ProposedMode<Repository> {
  const confirmOverwrite = !run.force && directoryExists && replacesDirectory(destination);
  if (confirmOverwrite && run.interaction === 'never') {
    return { kind: 'refuse', because: { kind: 'cannotAsk', question: 'overwrite' } };
  }
  switch (destination.kind) {
    case 'overwrite':
      return { kind: 'save', confirmOverwrite, warnNoRepository: false };
    case 'noRepository':
      if (run.force) {
        return { kind: 'save', confirmOverwrite, warnNoRepository: true };
      }
      if (run.interaction === 'never') {
        return { kind: 'refuse', because: { kind: 'cannotAsk', question: 'createRepository' } };
      }
      return { kind: 'askToCreate', confirmOverwrite };
    case 'record':
      if (run.force && destination.because.kind !== 'noRecord') {
        return { kind: 'refuse', because: { kind: 'recordedNotReplaced' } };
      }
      return { kind: 'record', repository: destination.repository, confirmOverwrite };
    case 'merge':
      return {
        kind: 'merge',
        repository: destination.repository,
        base: destination.base,
        confirmOverwrite: false,
        onConflict: run.force ? 'markers' : run.interaction === 'ask' ? 'ask' : 'refuse'
      };
  }
}

/** The mode once the developer has answered whether to make the directory a repository: a no saves without one. */
export function creating(answer: boolean): Extract<WriteMode<never>, { kind: 'init' | 'save' }> {
  return answer
    ? { kind: 'init', confirmOverwrite: false }
    : { kind: 'save', confirmOverwrite: false, warnNoRepository: true };
}
