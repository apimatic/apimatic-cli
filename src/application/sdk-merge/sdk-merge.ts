import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { Conflict, ConflictKind, FileWrite, MergeFiles, MergePlan, Rename } from './merge-plan.js';
import { MergeTreeOutput } from './merge-tree-output.js';

/** How a path changed between two trees, as `diff-tree` reports it. */
export type Change = {
  status: 'A' | 'M' | 'D' | 'T' | 'R' | 'C';
  path: RelativeFilePath;
  from?: RelativeFilePath;
  blob?: string;
};

export type MergeInputs = {
  merge: MergeTreeOutput;
  /** Base to the disk: what you changed. Renames paired. */
  yours: readonly Change[];
  /** Base to the fresh generation: what the generator changed. Renames paired. */
  generated: readonly Change[];
  /** Disk to the merged tree: what the run writes and removes. No renames. */
  applied: readonly Change[];
  /** Every path the base holds. */
  basePaths: readonly RelativeFilePath[];
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
    const key = entry.path.toString();
    stagesByPath.set(key, (stagesByPath.get(key) ?? new Set()).add(entry.stage));
  }
  const byPath = new Map<string, Conflict>();
  for (const { paths, type, message } of merge.messages) {
    if (!type.startsWith(CONFLICT_PREFIX)) {
      continue;
    }
    for (const path of paths) {
      const key = path.toString();
      const kind = kindOf(type, message, stagesByPath.get(key) ?? new Set());
      const known = byPath.get(key);
      if (known === undefined || RANK[kind] > RANK[known.kind]) {
        byPath.set(key, kind === 'other' ? { path, kind, message } : { path, kind });
      }
    }
  }
  return [...byPath.values()];
}

/** Each change under every path it names, so a rename is found by either name. */
const changedPaths = (changes: readonly Change[]): Map<string, Change> =>
  new Map(
    changes.flatMap((change): [string, Change][] =>
      change.from === undefined
        ? [[change.path.toString(), change]]
        : [
            [change.from.toString(), change],
            [change.path.toString(), change]
          ]
    )
  );

/**
 * What git's merge means for the SDK directory: the writes and deletions that bring the disk
 * to the merged tree, the conflicts by kind, the renames each side made, and every other path
 * by what happened to it.
 */
export function planMerge(inputs: MergeInputs): MergePlan {
  const conflicts = conflictsOf(inputs.merge);
  const conflicted = new Set(conflicts.map((conflict) => conflict.path.toString()));
  const yours = changedPaths(inputs.yours);
  const generated = changedPaths(inputs.generated);
  const base = new Set(inputs.basePaths.map((path) => path.toString()));

  const writes: FileWrite[] = [];
  const deletes: RelativeFilePath[] = [];
  const files: Record<keyof MergeFiles, RelativeFilePath[]> = {
    added: [],
    updated: [],
    merged: [],
    removed: [],
    kept: [],
    unchanged: []
  };

  for (const change of inputs.applied) {
    const key = change.path.toString();
    if (change.status === 'D') {
      deletes.push(change.path);
      if (!conflicted.has(key)) {
        files.removed.push(change.path);
      }
      continue;
    }
    writes.push({ path: change.path, blob: change.blob! });
    if (conflicted.has(key)) {
      continue;
    }
    if (!base.has(key) && generated.get(key)?.status === 'A') {
      files.added.push(change.path);
    } else if (yours.get(key)?.status === 'M' && generated.has(key)) {
      files.merged.push(change.path);
    } else {
      files.updated.push(change.path);
    }
  }

  for (const [key, change] of yours) {
    if (change.status === 'M' && !generated.has(key) && !conflicted.has(key)) {
      files.kept.push(change.path);
    }
  }
  for (const path of inputs.basePaths) {
    const key = path.toString();
    if (!yours.has(key) && !generated.has(key)) {
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
