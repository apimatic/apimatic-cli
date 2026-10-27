import { RelativeFilePath } from '../file/relativeFilePath.js';
import { Change, MergeTreeOutput } from '../git/merge-tree.js';

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
  /** A shape git reports that fits none of the above, such as both sides renaming one file differently; `message` is git's. */
  | 'other';

/**
 * A file to write, as the blob the merged tree holds for it. `settle` names the side whose
 * lines win in each block of markers the blob holds, where the developer chose one.
 */
export type FileWrite = { path: RelativeFilePath; blob: string; settle?: ConflictSide };

/** Whose lines win where you and the generator changed the same ones. */
export type ConflictSide = 'generated' | 'yours';

/** What the developer chose when a regeneration conflicted, asked before anything is written. */
export type ConflictChoice = 'resolve' | ConflictSide | 'cancel';

/** What the developer chose when the last run's conflicts are still unresolved, asked before generating. */
export type UnresolvedChoice = 'resolve' | ConflictSide;

export type Conflict = { path: RelativeFilePath; kind: ConflictKind; message?: string };

/** Each side's version of a file git could not merge line by line; none where that side has no file. */
export type Sides<T> = { yours: T | undefined; generated: T | undefined };

/**
 * The version a conflicted file settles to, whole, for `side`. The generator's side falls back
 * to yours where the generator no longer produces the file, so an edit of yours is never thrown
 * away by a choice that promises to keep your other edits; your side stays deleted where you
 * deleted the file.
 */
export function chosen<T>(side: ConflictSide, sides: Sides<T>): T | undefined {
  return side === 'generated' ? sides.generated ?? sides.yours : sides.yours;
}

export type Rename = { from: RelativeFilePath; to: RelativeFilePath; by: 'generator' | 'you' };

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
  /** Files neither side changed. */
  unchanged: readonly RelativeFilePath[];
};

/** The `MergeFiles` holding files you never edited, which only the generator changed. */
export const GENERATOR_FILES = ['added', 'updated', 'removed'] as const;

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

/** The conflicts whose file is written with markers in it. */
const MARKED_KINDS: readonly ConflictKind[] = ['bothChanged', 'bothAdded'];

const leavesMarkers = (conflict: Conflict): boolean => MARKED_KINDS.includes(conflict.kind);

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
 * What a run writes and removes in the SDK directory, by path below it with `/` between segments.
 * A path the plan does not mention is left as it is.
 */
export class MergePlan {
  public readonly writes: readonly FileWrite[];
  public readonly deletes: readonly RelativeFilePath[];
  public readonly conflicts: readonly Conflict[];
  public readonly renames: readonly Rename[];
  public readonly files: MergeFiles;
  /** For each conflicted path, the blob each side holds for it. */
  private readonly sides: ReadonlyMap<string, Sides<string>>;

  constructor(
    writes: readonly FileWrite[],
    deletes: readonly RelativeFilePath[],
    conflicts: readonly Conflict[],
    renames: readonly Rename[],
    files: MergeFiles,
    sides: ReadonlyMap<string, Sides<string>> = new Map()
  ) {
    this.writes = writes;
    this.deletes = deletes;
    this.conflicts = conflicts;
    this.renames = renames;
    this.files = files;
    this.sides = sides;
  }

  /**
   * What git's merge means for the SDK directory: the writes and deletions that bring the disk
   * to the merged tree, the conflicts by kind, the renames each side made, and every other path
   * by what happened to it.
   */
  public static from(inputs: MergeInputs): MergePlan {
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
      if ((change.status === 'M' || change.status === 'A') && !generated.has(key) && !conflicted.has(key)) {
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

    const sides = new Map(
      conflicts.map((conflict): [string, Sides<string>] => {
        const key = conflict.path.toString();
        return [key, { yours: yours.get(key)?.blob, generated: generated.get(key)?.blob }];
      })
    );
    return new MergePlan(writes, deletes, conflicts, renames, files, sides);
  }

  /**
   * The same plan with every conflict settled for `side`. A file with markers is settled block
   * by block when written, that side's lines winning and the rest merged as git did. Any other
   * conflict is settled whole, as `chosen` decides: that side's version written, yours left as
   * it is on disk, or the file left deleted. A conflict of another shape, such as a file of
   * yours inside a directory the generator renamed, keeps git's own placement, which the plan
   * already holds, and stays listed as what happened to it. Every other path keeps what the
   * merge decided.
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
    return new MergePlan([...writes.values()], [...deletes.values()], [], this.renames, {
      ...this.files,
      updated,
      merged,
      kept
    });
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
