import { RelativeFilePath } from '../file/relativeFilePath.js';
import { ConflictSide, MergePlan } from './merge-plan.js';
import { Regeneration } from './repository-state.js';

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
