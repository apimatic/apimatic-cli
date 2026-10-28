import { RelativeFilePath } from '../file/relativeFilePath.js';
import { Regeneration } from './repository-state.js';
import { ConflictSide, MergePlan } from './merge-plan.js';

/** A regeneration with its conflicts settled: the plan to write, and the side and paths settled for it, if any. */
export type Settlement = {
  regeneration: Regeneration;
  plan: MergePlan;
  settled?: { side: ConflictSide; paths: readonly RelativeFilePath[] };
};

/** The merge as git made it: clean, or with markers for the developer to resolve. */
export function resolving(regeneration: Regeneration): Settlement {
  return { regeneration, plan: regeneration.merge.plan };
}

/** The merge with every conflict settled for `side`, as `MergePlan.taking` does. */
export function favouring(side: ConflictSide, regeneration: Regeneration): Settlement {
  return {
    regeneration,
    plan: regeneration.merge.plan.taking(side),
    settled: { side, paths: regeneration.merge.plan.conflictedPaths() }
  };
}
