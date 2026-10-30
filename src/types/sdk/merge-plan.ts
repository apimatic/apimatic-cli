import { ValueMap, ValueSet } from '../common/value-map.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { BlobId } from '../git/blob-id.js';
import { Change, MergeMessageKind, MergeTreeOutput, STAGE } from '../git/merge-tree.js';

/** The merge runs with your tree as git's "ours" and the generation as its "theirs". */
export const SIDE_STAGE = { yours: STAGE.ours, generated: STAGE.theirs } as const;

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
export type FileWrite = { path: RelativeFilePath; blob: BlobId; settle?: ConflictSide };

/** Whose lines win where you and the generator changed the same ones. */
export type ConflictSide = 'generated' | 'yours';

export type Conflict = { path: RelativeFilePath; kind: ConflictKind };

/** Each side's version of a file git could not merge line by line; none where that side has no file. */
export type Sides<T> = { yours: T | undefined; generated: T | undefined };

/** For each conflicted path, the blob each side holds for it. */
export type ConflictSides = ValueMap<RelativeFilePath, Sides<BlobId>>;

/**
 * The whole-file settlement for `side`, and which side it came from: the generator's side falls back
 * to yours where it no longer produces the file, so an edit of yours is never thrown away by a choice that keeps the rest.
 */
export function chosen<T>(side: ConflictSide, sides: Sides<T>): { side: ConflictSide; content: T } | undefined {
  if (side === 'generated' && sides.generated !== undefined) {
    return { side: 'generated', content: sides.generated };
  }
  return sides.yours === undefined ? undefined : { side: 'yours', content: sides.yours };
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

/** The stronger of two accounts of one path, when git reports it more than once. */
const RANK: Record<ConflictKind, number> = {
  binary: 5,
  bothAdded: 4,
  deletedByYou: 3,
  noLongerGenerated: 3,
  bothChanged: 2,
  other: 1
};

/** What a conflict git reported means here; a deletion is yours or the generator's by which side still has the file. */
function kindOf(reported: Exclude<MergeMessageKind, 'informational'>, stages: ReadonlySet<number>): ConflictKind {
  switch (reported) {
    case 'binary':
      return 'binary';
    case 'addAdd':
      return 'bothAdded';
    case 'modifyDelete':
    case 'renameDelete':
      return stages.has(SIDE_STAGE.yours) ? 'noLongerGenerated' : 'deletedByYou';
    case 'contents':
      return 'bothChanged';
    case 'otherConflict':
      return 'other';
  }
}

function conflictsOf(merge: MergeTreeOutput): Conflict[] {
  const stagesByPath = new ValueMap<RelativeFilePath, Set<number>>();
  for (const entry of merge.stages) {
    stagesByPath.set(entry.path, (stagesByPath.get(entry.path) ?? new Set()).add(entry.stage));
  }
  const byPath = new ValueMap<RelativeFilePath, Conflict>();
  for (const { paths, kind: reported } of merge.messages) {
    if (reported === 'informational') {
      continue;
    }
    for (const path of paths) {
      const kind = kindOf(reported, stagesByPath.get(path) ?? new Set());
      const known = byPath.get(path);
      if (known === undefined || RANK[kind] > RANK[known.kind]) {
        byPath.set(path, { path, kind });
      }
    }
  }
  return byPath.values();
}

/** The conflicts whose file is written with markers in it. */
const MARKED_KINDS: readonly ConflictKind[] = ['bothChanged', 'bothAdded'];

const leavesMarkers = (conflict: Conflict): boolean => MARKED_KINDS.includes(conflict.kind);

/** Each change under every path it names, so a rename is found by either name. */
const changedPaths = (changes: readonly Change[]): ValueMap<RelativeFilePath, Change> =>
  new ValueMap(
    changes.flatMap((change): [RelativeFilePath, Change][] =>
      'from' in change
        ? [
            [change.from, change],
            [change.path, change]
          ]
        : [[change.path, change]]
    )
  );

/** The blob a side holds at `path` itself; none where its change moved the file away from there. */
const blobAt = (changes: ValueMap<RelativeFilePath, Change>, path: RelativeFilePath): BlobId | undefined => {
  const change = changes.get(path);
  return change !== undefined && change.path.isEqual(path) && 'blob' in change ? change.blob : undefined;
};

/** What the summary reports: every path that is not in conflict, by what happened to it. */
function filesOf(
  inputs: MergeInputs,
  conflicted: ValueSet<RelativeFilePath>,
  yours: ValueMap<RelativeFilePath, Change>,
  generated: ValueMap<RelativeFilePath, Change>
): MergeFiles {
  const base = new ValueSet(inputs.basePaths);
  const files: Record<keyof MergeFiles, RelativeFilePath[]> = {
    added: [],
    updated: [],
    merged: [],
    removed: [],
    kept: []
  };
  for (const change of inputs.applied) {
    const { path } = change;
    if (conflicted.has(path)) {
      continue;
    }
    if (change.status === 'D') {
      files.removed.push(path);
    } else if (!base.has(path) && generated.get(path)?.status === 'A') {
      files.added.push(path);
    } else if (yours.get(path)?.status === 'M' && generated.has(path)) {
      files.merged.push(path);
    } else {
      files.updated.push(path);
    }
  }
  for (const [path, change] of yours) {
    if ((change.status === 'M' || change.status === 'A') && !generated.has(path) && !conflicted.has(path)) {
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
  private readonly sides: ConflictSides;

  constructor(
    writes: readonly FileWrite[],
    deletes: readonly RelativeFilePath[],
    conflicts: readonly Conflict[],
    files: MergeFiles,
    sides: ConflictSides = new ValueMap()
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
    const conflicted = new ValueSet(conflicts.map((conflict) => conflict.path));
    const yours = changedPaths(inputs.yours);
    const generated = changedPaths(inputs.generated);
    const writes = inputs.applied.flatMap((change) =>
      change.status === 'D' ? [] : [{ path: change.path, blob: change.blob }]
    );
    const deletes = inputs.applied.flatMap((change) => (change.status === 'D' ? [change.path] : []));
    const sides: ConflictSides = new ValueMap(
      conflicts.map((conflict): [RelativeFilePath, Sides<BlobId>] => [
        conflict.path,
        { yours: blobAt(yours, conflict.path), generated: blobAt(generated, conflict.path) }
      ])
    );
    return new MergePlan(writes, deletes, conflicts, filesOf(inputs, conflicted, yours, generated), sides);
  }

  /**
   * Every conflict settled for `side`: a marked file block by block as it is written, the rest
   * whole as `chosen` decides; a conflict of another shape keeps git's placement.
   */
  public taking(side: ConflictSide): MergePlan {
    const writes = new ValueMap(this.writes.map((write): [RelativeFilePath, FileWrite] => [write.path, write]));
    const deletes = new ValueSet(this.deletes);
    const updated = [...this.files.updated];
    const merged = [...this.files.merged];
    const kept = [...this.files.kept];
    for (const conflict of this.conflicts) {
      const { path, kind } = conflict;
      if (kind === 'other') {
        continue;
      }
      const marked = writes.get(path);
      if (leavesMarkers(conflict) && marked !== undefined) {
        writes.set(path, { ...marked, settle: side });
        merged.push(path);
        continue;
      }
      const picked = chosen(side, this.sides.get(path) ?? { yours: undefined, generated: undefined });
      deletes.delete(path);
      if (picked === undefined) {
        writes.delete(path);
      } else if (picked.side === 'yours') {
        writes.delete(path);
        kept.push(path);
      } else {
        writes.set(path, { path, blob: picked.content });
        updated.push(path);
      }
    }
    return new MergePlan(writes.values(), deletes.values(), [], { ...this.files, updated, merged, kept });
  }

  public hasConflicts(): boolean {
    return this.conflicts.length > 0;
  }

  public conflictedPaths(): RelativeFilePath[] {
    return this.conflicts.map((conflict) => conflict.path);
  }

  /** The conflicted files written with conflict markers in them. */
  public markedPaths(): RelativeFilePath[] {
    return this.conflicts.filter(leavesMarkers).map((conflict) => conflict.path);
  }

  /** The conflicted files left without markers, for you to keep or remove. */
  public unmarkedPaths(): RelativeFilePath[] {
    return this.conflicts.filter((conflict) => !leavesMarkers(conflict)).map((conflict) => conflict.path);
  }

  /** Whether the file at `path` is written with conflict markers in it. */
  public hasMarkers(path: RelativeFilePath): boolean {
    return this.conflicts.some((conflict) => conflict.path.isEqual(path) && leavesMarkers(conflict));
  }
}
