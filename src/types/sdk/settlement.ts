import { RelativeFilePath } from '../file/relativeFilePath.js';
import { Regeneration } from '../sdk-repository-context.js';
import { MergePlan } from './merge-plan.js';

/**
 * A regeneration whose conflicts are settled: the plan the run writes, and the paths it settled
 * for the generator, named once they are written. Markers the developer chose to resolve stay
 * in the plan as conflicts.
 */
export type Settlement = {
  regeneration: Regeneration;
  plan: MergePlan;
  settledForGenerator: readonly RelativeFilePath[];
};

/** The merge as git made it: clean, or with markers for the developer to resolve. */
export function resolving(regeneration: Regeneration): Settlement {
  return { regeneration, plan: regeneration.merge.plan, settledForGenerator: [] };
}

/** The merge run again the generator's way, so every file `original` left in conflict is settled whole. */
export function favouringGenerator(original: Regeneration, favoured: Regeneration): Settlement {
  return {
    regeneration: favoured,
    plan: favoured.merge.plan.takingGenerated(),
    settledForGenerator: original.merge.plan.conflictedPaths()
  };
}
