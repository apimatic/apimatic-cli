import { Result } from 'neverthrow';
import { FilePath } from '../file/filePath.js';
import { RecordProblem, RepositoryProblem, ShareHookInstall, ShareHookNeedsOneStep } from './repository-state.js';

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
