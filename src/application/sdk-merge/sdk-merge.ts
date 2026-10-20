import { Conflict, ConflictKind, FileWrite, MergeFiles, MergePlan, Rename } from './merge-plan.js';
import { MergeTreeOutput } from './merge-tree-output.js';

/** How a path changed between two trees, as `diff-tree` reports it. */
export type Change = { status: 'A' | 'M' | 'D' | 'T' | 'R' | 'C'; path: string; from?: string; blob?: string };

export type MergeInputs = {
  merge: MergeTreeOutput;
  /** Base to the disk: what you changed. Renames paired. */
  yours: readonly Change[];
  /** Base to the fresh generation: what the generator changed. Renames paired. */
  generated: readonly Change[];
  /** Disk to the merged tree: what the run writes and removes. No renames. */
  applied: readonly Change[];
  /** Every path the base holds. */
  basePaths: readonly string[];
};

const CONFLICT_PREFIX = 'CONFLICT (';

/** The stronger of two accounts of one path, when git reports it more than once. */
const RANK: Record<ConflictKind, number> = {
  binary: 5,
  bothAdded: 4,
  deletedByYou: 3,
  noLongerGenerated: 3,
  bothChanged: 2,
  other: 1
};

function kindOf(type: string, message: string, stages: ReadonlySet<number>): ConflictKind {
  if (type === 'CONFLICT (binary)') {
    return 'binary';
  }
  if (message.startsWith('CONFLICT (add/add)')) {
    return 'bothAdded';
  }
  if (type === 'CONFLICT (modify/delete)' || type === 'CONFLICT (rename/delete)') {
    return stages.has(2) ? 'noLongerGenerated' : 'deletedByYou';
  }
  if (type === 'CONFLICT (contents)') {
    return 'bothChanged';
  }
  return 'other';
}

function conflictsOf(merge: MergeTreeOutput): Conflict[] {
  const stagesByPath = new Map<string, Set<number>>();
  for (const entry of merge.stages) {
    stagesByPath.set(entry.path, (stagesByPath.get(entry.path) ?? new Set()).add(entry.stage));
  }
  const byPath = new Map<string, Conflict>();
  for (const { paths, type, message } of merge.messages) {
    if (!type.startsWith(CONFLICT_PREFIX)) {
      continue;
    }
    for (const path of paths) {
      const kind = kindOf(type, message, stagesByPath.get(path) ?? new Set());
      const known = byPath.get(path);
      if (known === undefined || RANK[kind] > RANK[known.kind]) {
        byPath.set(path, kind === 'other' ? { path, kind, message } : { path, kind });
      }
    }
  }
  return [...byPath.values()];
}

const changedPaths = (changes: readonly Change[]) =>
  new Map(
    changes.flatMap((change) =>
      change.from === undefined
        ? [[change.path, change]]
        : [
            [change.from, change],
            [change.path, change]
          ]
    )
  );

/**
 * What git's merge means for the SDK directory: the writes and deletions that bring the disk
 * to the merged tree, the conflicts by kind, the renames each side made, and the counts.
 */
export function planMerge(inputs: MergeInputs): MergePlan {
  const conflicts = conflictsOf(inputs.merge);
  const conflicted = new Set(conflicts.map((conflict) => conflict.path));
  const yours = changedPaths(inputs.yours);
  const generated = changedPaths(inputs.generated);
  const base = new Set(inputs.basePaths);

  const writes: FileWrite[] = [];
  const deletes: string[] = [];
  const files: Record<keyof MergeFiles, string[]> = {
    added: [],
    updated: [],
    merged: [],
    removed: [],
    kept: [],
    unchanged: []
  };

  for (const change of inputs.applied) {
    if (change.status === 'D') {
      deletes.push(change.path);
      if (!conflicted.has(change.path)) {
        files.removed.push(change.path);
      }
      continue;
    }
    writes.push({ path: change.path, blob: change.blob! });
    if (conflicted.has(change.path)) {
      continue;
    }
    if (!base.has(change.path) && generated.get(change.path)?.status === 'A') {
      files.added.push(change.path);
    } else if (yours.get(change.path)?.status === 'M' && generated.has(change.path)) {
      files.merged.push(change.path);
    } else {
      files.updated.push(change.path);
    }
  }

  for (const [path, change] of yours) {
    if (change.status === 'M' && !generated.has(path) && !conflicted.has(path)) {
      files.kept.push(path);
    }
  }
  for (const path of base) {
    if (!yours.has(path) && !generated.has(path)) {
      files.unchanged.push(path);
    }
  }

  const renames: Rename[] = [
    ...inputs.generated
      .filter((change) => change.status === 'R')
      .map((change) => ({ from: change.from!, to: change.path, by: 'generator' as const })),
    ...inputs.yours
      .filter((change) => change.status === 'R')
      .map((change) => ({ from: change.from!, to: change.path, by: 'you' as const }))
  ];

  return new MergePlan(writes, deletes, conflicts, renames, files);
}
