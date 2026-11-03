import { RelativeFilePath } from '../file/relativeFilePath.js';
import { StageEntry } from '../git/merge-tree.js';
import { MergedText, Side } from './conflict-markers.js';

export type ConflictKind =
  /** You and the generator changed the same lines. */
  | 'bothChanged'
  /** You and the generator both added the path with different content. */
  | 'bothAdded'
  /** You deleted the file and the generator changed it. */
  | 'deletedByYou'
  /** You edited the file and the generator no longer produces it. */
  | 'noLongerGenerated'
  /** You and the generator both changed a binary file. */
  | 'binary'
  /** A shape git reports that fits none of the above, such as both sides renaming one file differently. */
  | 'other';

/** A file to write, with its content as the merged tree holds it. */
export type FileWrite = { path: RelativeFilePath; content: Uint8Array };

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
};

type CountedAs = 'merged' | 'updated' | 'kept';

/** How one conflict lands once a side is chosen: what the run writes or removes for it, and what the summary says about it. */
export class Settlement {
  private constructor(
    private readonly written: readonly FileWrite[],
    private readonly removal: readonly RelativeFilePath[],
    private readonly counted: { as: CountedAs; path: RelativeFilePath } | undefined
  ) {}

  /** The chosen side's lines in each block, counted among the merged files. */
  public static merged(write: FileWrite): Settlement {
    return new Settlement([write], [], { as: 'merged', path: write.path });
  }

  /** The generator's whole version, counted among the updated files. */
  public static updated(write: FileWrite): Settlement {
    return new Settlement([write], [], { as: 'updated', path: write.path });
  }

  /** Your file stays as it is, named among the kept ones. */
  public static kept(path: RelativeFilePath): Settlement {
    return new Settlement([], [], { as: 'kept', path });
  }

  /** The file goes from the disk, with nothing said: a deletion of yours that the last run had written over. */
  public static removed(path: RelativeFilePath): Settlement {
    return new Settlement([], [path], undefined);
  }

  /** Nothing on disk changes and the summary says nothing: a deletion of yours stands. */
  public static untouched(): Settlement {
    return new Settlement([], [], undefined);
  }

  /** Git's placement stands, with nothing said: a conflict of another shape. */
  public static asPlaced(writes: readonly FileWrite[]): Settlement {
    return new Settlement(writes, [], undefined);
  }

  public writes(): readonly FileWrite[] {
    return this.written;
  }

  public removes(): readonly RelativeFilePath[] {
    return this.removal;
  }

  /** `files` with this settlement's path added under what the summary calls it. */
  public countedIn(files: MergeFiles): MergeFiles {
    return this.counted === undefined
      ? files
      : { ...files, [this.counted.as]: [...files[this.counted.as], this.counted.path] };
  }
}

/** A path git could not merge: what it is, what a hand resolution starts from, and how a chosen side settles it. */
export interface Conflict {
  readonly path: RelativeFilePath;
  readonly kind: ConflictKind;
  /** The versions git keeps for the path, for the index to hold as a merge would leave it. */
  readonly stages: readonly StageEntry[];
  /** Whether the file is written with conflict markers in it, for a merge tool to find. */
  leavesMarkers(): boolean;
  /** What the run writes for the path when the developer resolves by hand: the file as git placed it, or nothing. */
  asPlaced(): readonly FileWrite[];
  settledFor(side: Side): Settlement;
}

/** You and the generator changed the same lines, or both added the path: git marked each block, and a side settles it. */
export class MarkedConflict implements Conflict {
  constructor(
    public readonly path: RelativeFilePath,
    public readonly kind: 'bothChanged' | 'bothAdded',
    public readonly stages: readonly StageEntry[],
    private readonly text: MergedText
  ) {}

  public leavesMarkers(): boolean {
    return true;
  }

  public asPlaced(): readonly FileWrite[] {
    return [{ path: this.path, content: this.text.relabelled() }];
  }

  public settledFor(side: Side): Settlement {
    return Settlement.merged({ path: this.path, content: this.text.settledFor(side) });
  }
}

/**
 * A file git could not merge line by line, since a side deleted it or it is binary, or one it marked but did
 * not need to write: a side takes it whole, as the settlement made for that side says.
 */
export class WholeConflict implements Conflict {
  constructor(
    public readonly path: RelativeFilePath,
    public readonly kind: Exclude<ConflictKind, 'other'>,
    public readonly stages: readonly StageEntry[],
    private readonly placed: readonly FileWrite[],
    private readonly generated: Settlement,
    private readonly yours: Settlement
  ) {}

  public leavesMarkers(): boolean {
    return false;
  }

  public asPlaced(): readonly FileWrite[] {
    return this.placed;
  }

  public settledFor(side: Side): Settlement {
    return side === 'yours' ? this.yours : this.generated;
  }
}

/** A shape git reports that fits no other, such as both sides renaming one file differently. */
export class PlacedConflict implements Conflict {
  public readonly kind = 'other';

  constructor(
    public readonly path: RelativeFilePath,
    public readonly stages: readonly StageEntry[],
    private readonly placed: readonly FileWrite[]
  ) {}

  public leavesMarkers(): boolean {
    return false;
  }

  public asPlaced(): readonly FileWrite[] {
    return this.placed;
  }

  // Either side lands as git placed it.
  public settledFor(): Settlement {
    return Settlement.asPlaced(this.placed);
  }
}
