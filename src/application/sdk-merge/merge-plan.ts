import { RelativeFilePath } from '../../types/file/relativeFilePath.js';

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
  /** Edited files the generator left alone. */
  kept: readonly RelativeFilePath[];
  /** Files neither side changed. */
  unchanged: readonly RelativeFilePath[];
};

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

  constructor(
    writes: readonly FileWrite[],
    deletes: readonly RelativeFilePath[],
    conflicts: readonly Conflict[],
    renames: readonly Rename[],
    files: MergeFiles
  ) {
    this.writes = writes;
    this.deletes = deletes;
    this.conflicts = conflicts;
    this.renames = renames;
    this.files = files;
  }

  public hasConflicts(): boolean {
    return this.conflicts.length > 0;
  }

  public conflictedPaths(): RelativeFilePath[] {
    return this.conflicts.map((conflict) => conflict.path);
  }

  public conflictsByKind(): Record<ConflictKind, number> {
    const counts: Record<ConflictKind, number> = {
      bothChanged: 0,
      bothAdded: 0,
      deletedByYou: 0,
      noLongerGenerated: 0,
      binary: 0,
      other: 0
    };
    for (const conflict of this.conflicts) {
      counts[conflict.kind] += 1;
    }
    return counts;
  }

  /** Whether the file at `path` is written with conflict markers in it. */
  public hasMarkers(path: RelativeFilePath): boolean {
    return this.conflicts.some(
      (conflict) => conflict.path.isEqual(path) && (conflict.kind === 'bothChanged' || conflict.kind === 'bothAdded')
    );
  }
}
