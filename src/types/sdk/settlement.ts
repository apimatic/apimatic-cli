import { RelativeFilePath } from '../file/relativeFilePath.js';
import { Regeneration } from '../sdk-repository-context.js';
import { ConflictSide, MergePlan } from './merge-plan.js';

/**
 * A regeneration whose conflicts are settled: the plan the run writes, and, when the developer
 * chose a side, that side and the paths settled for it, named once they are written. Markers
 * the developer chose to resolve stay in the plan as conflicts.
 */
export type Settlement = {
  regeneration: Regeneration;
  plan: MergePlan;
  settled?: { side: ConflictSide; paths: readonly RelativeFilePath[] };
};

/** The merge as git made it: clean, or with markers for the developer to resolve. */
export function resolving(regeneration: Regeneration): Settlement {
  return { regeneration, plan: regeneration.merge.plan };
}

/**
 * The merge run again with `side` winning every overlapping hunk, and whatever that still
 * leaves in conflict settled whole for `side`, so every file `original` left in conflict is settled.
 */
export function favouring(side: ConflictSide, original: Regeneration, favoured: Regeneration): Settlement {
  return {
    regeneration: favoured,
    plan: favoured.merge.plan.taking(side),
    settled: { side, paths: original.merge.plan.conflictedPaths() }
  };
}
