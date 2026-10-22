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

/** A file to write, as the blob the merged tree holds for it. */
export type FileWrite = { path: RelativeFilePath; blob: string };

/** What the developer chose when a regeneration conflicted, asked before anything is written. */
export type ConflictChoice = 'resolve' | 'generated' | 'keep';

/** What the developer chose when the last run's markers are still in the files, asked before generating. */
export type UnresolvedChoice = 'resolve' | 'generated' | 'undo';

export type Conflict = { path: RelativeFilePath; kind: ConflictKind; message?: string };

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
  /** Files you edited or added that the generator left alone. */
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
  /** For each conflicted path, the generator's blob, or none where the generator no longer produces the file. */
  private readonly generatedSides: ReadonlyMap<string, string | undefined>;

  constructor(
    writes: readonly FileWrite[],
    deletes: readonly RelativeFilePath[],
    conflicts: readonly Conflict[],
    renames: readonly Rename[],
    files: MergeFiles,
    generatedSides: ReadonlyMap<string, string | undefined> = new Map()
  ) {
    this.writes = writes;
    this.deletes = deletes;
    this.conflicts = conflicts;
    this.renames = renames;
    this.files = files;
    this.generatedSides = generatedSides;
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

    const generatedSides = new Map(
      conflicts.map((conflict) => [conflict.path.toString(), generated.get(conflict.path.toString())?.blob])
    );
    return new MergePlan(writes, deletes, conflicts, renames, files, generatedSides);
  }

  /**
   * The same plan with every conflict settled the generator's way: its file written over yours,
   * or removed where it no longer produces one. Every other path keeps what the merge decided.
   */
  public takingGenerated(): MergePlan {
    const conflicted = new Set(this.conflicts.map((conflict) => conflict.path.toString()));
    const writes = this.writes.filter((write) => !conflicted.has(write.path.toString()));
    const deletes = this.deletes.filter((path) => !conflicted.has(path.toString()));
    const updated = [...this.files.updated];
    const removed = [...this.files.removed];
    for (const { path } of this.conflicts) {
      const blob = this.generatedSides.get(path.toString());
      if (blob === undefined) {
        deletes.push(path);
        removed.push(path);
      } else {
        writes.push({ path, blob });
        updated.push(path);
      }
    }
    return new MergePlan(writes, deletes, [], this.renames, { ...this.files, updated, removed });
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
