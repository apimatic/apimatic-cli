import { RelativeFilePath } from '../file/relativeFilePath.js';
import { Change, MergeTreeOutput, STAGE } from '../git/merge-tree.js';

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

export type ConflictKind =
  /** You and the generator changed the same lines; the file holds markers. */
  | 'bothChanged'
  /** You and the generator both added the path with different content; the file holds markers. */
  | 'bothAdded'
  /** You deleted the file and the generator changed it; the new version is written back. */
  | 'deletedByYou'
  /** You edited the file and the generator no longer produces it; your file stays. */
  | 'noLongerGenerated'
  /** You and the generator both changed a binary file; yours stays. */
  | 'binary'
  /** A shape git reports that fits none of the above, such as both sides renaming one file differently. */
  | 'other';

/** A file to write, as the blob the merged tree holds; `settle` is the side whose lines win in each marker block. */
export type FileWrite = { path: RelativeFilePath; blob: string; settle?: ConflictSide };

/** Whose lines win where you and the generator changed the same ones. */
export type ConflictSide = 'generated' | 'yours';

/** What the developer chose when a regeneration conflicted, asked before anything is written. */
export type ConflictChoice = 'resolve' | ConflictSide | 'cancel';

/** What the developer chose when the last run's conflicts are still unresolved, asked before generating. */
export type UnresolvedChoice = 'resolve' | ConflictSide;

export type Conflict = { path: RelativeFilePath; kind: ConflictKind };

/** Each side's version of a file git could not merge line by line; none where that side has no file. */
export type Sides<T> = { yours: T | undefined; generated: T | undefined };

/**
 * The whole-file settlement for `side`: the generator's side falls back to yours where it no
 * longer produces the file, so an edit of yours is never thrown away by a choice that keeps the rest.
 */
export function chosen<T>(side: ConflictSide, sides: Sides<T>): T | undefined {
  return side === 'generated' ? sides.generated ?? sides.yours : sides.yours;
}

/** Every path the run touched or left alone, by what happened to it; conflicted paths are listed under `conflicts` instead. */
export type MergeFiles = {
  /** Files the generator produced for the first time. */
  added: readonly RelativeFilePath[];
  /** Unedited files replaced by their new version, or moved to the generator's new name. */
  updated: readonly RelativeFilePath[];
  /** Edited files the generator also changed, merged without conflict. */
  merged: readonly RelativeFilePath[];
  /** Unedited files the generator stopped producing. */
  removed: readonly RelativeFilePath[];
  /** Files you edited or added that the generator left alone, and conflicted files settled for your side. */
  kept: readonly RelativeFilePath[];
};

/** The `MergeFiles` holding files you edited. */
export const YOUR_FILES = ['merged', 'kept'] as const;

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
    return stages.has(STAGE.yours) ? 'noLongerGenerated' : 'deletedByYou';
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
        byPath.set(key, { path, kind });
      }
    }
  }
  return [...byPath.values()];
}

/** The conflicts whose file is written with markers in it. */
const MARKED_KINDS: readonly ConflictKind[] = ['bothChanged', 'bothAdded'];

const leavesMarkers = (conflict: Conflict): boolean => MARKED_KINDS.includes(conflict.kind);

/** Each change under every path it names, so a rename is found by either name. */
const changedPaths = (changes: readonly Change[]): Map<string, Change> =>
  new Map(
    changes.flatMap((change): [string, Change][] =>
      'from' in change
        ? [
            [change.from.toString(), change],
            [change.path.toString(), change]
          ]
        : [[change.path.toString(), change]]
    )
  );

/** The blob a side holds at `key` itself; none where its change moved the file away from there. */
const blobAt = (changes: Map<string, Change>, key: string): string | undefined => {
  const change = changes.get(key);
  return change !== undefined && change.path.toString() === key && 'blob' in change ? change.blob : undefined;
};

/** What the summary reports: every path that is not in conflict, by what happened to it. */
function filesOf(
  inputs: MergeInputs,
  conflicted: ReadonlySet<string>,
  yours: Map<string, Change>,
  generated: Map<string, Change>
): MergeFiles {
  const base = new Set(inputs.basePaths.map((path) => path.toString()));
  const files: Record<keyof MergeFiles, RelativeFilePath[]> = {
    added: [],
    updated: [],
    merged: [],
    removed: [],
    kept: []
  };
  for (const change of inputs.applied) {
    const key = change.path.toString();
    if (conflicted.has(key)) {
      continue;
    }
    if (change.status === 'D') {
      files.removed.push(change.path);
    } else if (!base.has(key) && generated.get(key)?.status === 'A') {
      files.added.push(change.path);
    } else if (yours.get(key)?.status === 'M' && generated.has(key)) {
      files.merged.push(change.path);
    } else {
      files.updated.push(change.path);
    }
  }
  for (const [key, change] of yours) {
    if ((change.status === 'M' || change.status === 'A') && !generated.has(key) && !conflicted.has(key)) {
      files.kept.push(change.path);
    }
  }
  return files;
}

/** What a run writes and removes below the SDK directory; a path the plan does not mention is left as it is. */
export class MergePlan {
  public readonly writes: readonly FileWrite[];
  public readonly deletes: readonly RelativeFilePath[];
  public readonly conflicts: readonly Conflict[];
  public readonly files: MergeFiles;
  /** For each conflicted path, the blob each side holds for it. */
  private readonly sides: ReadonlyMap<string, Sides<string>>;

  constructor(
    writes: readonly FileWrite[],
    deletes: readonly RelativeFilePath[],
    conflicts: readonly Conflict[],
    files: MergeFiles,
    sides: ReadonlyMap<string, Sides<string>> = new Map()
  ) {
    this.writes = writes;
    this.deletes = deletes;
    this.conflicts = conflicts;
    this.files = files;
    this.sides = sides;
  }

  /** What git's merge means for the SDK directory: writes, deletions, conflicts with each side's version, and the summary. */
  public static from(inputs: MergeInputs): MergePlan {
    const conflicts = conflictsOf(inputs.merge);
    const conflicted = new Set(conflicts.map((conflict) => conflict.path.toString()));
    const yours = changedPaths(inputs.yours);
    const generated = changedPaths(inputs.generated);
    const writes = inputs.applied.flatMap((change) =>
      change.status === 'D' ? [] : [{ path: change.path, blob: change.blob }]
    );
    const deletes = inputs.applied.flatMap((change) => (change.status === 'D' ? [change.path] : []));
    const sides = new Map(
      conflicts.map((conflict): [string, Sides<string>] => {
        const key = conflict.path.toString();
        return [key, { yours: blobAt(yours, key), generated: blobAt(generated, key) }];
      })
    );
    return new MergePlan(writes, deletes, conflicts, filesOf(inputs, conflicted, yours, generated), sides);
  }

  /**
   * Every conflict settled for `side`: a marked file block by block as it is written, the rest
   * whole as `chosen` decides; a conflict of another shape keeps git's placement.
   */
  public taking(side: ConflictSide): MergePlan {
    const writes = new Map(this.writes.map((write) => [write.path.toString(), write]));
    const deletes = new Map(this.deletes.map((path) => [path.toString(), path]));
    const updated = [...this.files.updated];
    const merged = [...this.files.merged];
    const kept = [...this.files.kept];
    for (const conflict of this.conflicts) {
      const { path, kind } = conflict;
      const key = path.toString();
      if (kind === 'other') {
        continue;
      }
      const marked = writes.get(key);
      if (leavesMarkers(conflict) && marked !== undefined) {
        writes.set(key, { ...marked, settle: side });
        merged.push(path);
        continue;
      }
      const sides = this.sides.get(key) ?? { yours: undefined, generated: undefined };
      const blob = chosen(side, sides);
      deletes.delete(key);
      if (blob === undefined) {
        writes.delete(key);
      } else if (blob === sides.yours) {
        writes.delete(key);
        kept.push(path);
      } else {
        writes.set(key, { path, blob });
        updated.push(path);
      }
    }
    return new MergePlan([...writes.values()], [...deletes.values()], [], { ...this.files, updated, merged, kept });
  }

  public hasConflicts(): boolean {
    return this.conflicts.length > 0;
  }

  public conflictedPaths(): RelativeFilePath[] {
    return this.conflicts.map((conflict) => conflict.path);
  }

  /** Whether any conflicted file is written with conflict markers in it. */
  public hasMarkedConflicts(): boolean {
    return this.conflicts.some(leavesMarkers);
  }

  /** Whether any conflicted file is left without markers, for you to keep or remove. */
  public hasUnmarkedConflicts(): boolean {
    return this.conflicts.some((conflict) => !leavesMarkers(conflict));
  }

  /** Whether the file at `path` is written with conflict markers in it. */
  public hasMarkers(path: RelativeFilePath): boolean {
    return this.conflicts.some((conflict) => conflict.path.isEqual(path) && leavesMarkers(conflict));
  }
}
