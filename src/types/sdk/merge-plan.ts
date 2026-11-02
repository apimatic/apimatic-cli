import { ValueMap, ValueSet } from '../common/value-map.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { Change, MergeMessageKind, MergeTreeOutput, STAGE } from '../git/merge-tree.js';

/** The merge runs with your tree as git's "ours" and the generation as its "theirs". */
const SIDE_STAGE = { yours: STAGE.ours, generated: STAGE.theirs } as const;

export type MergeInputs = {
  merge: MergeTreeOutput;
  /** Base to the disk: what you changed. Renames paired. */
  yours: readonly Change[];
  /** Base to the fresh generation: what the generator changed. Renames paired. */
  generated: readonly Change[];
  /** The disk to the merged tree, no renames: what the run writes, each as the merged tree holds it, and removes. */
  writes: readonly FileWrite[];
  deletes: readonly RelativeFilePath[];
  /** Every path the base holds. */
  basePaths: readonly RelativeFilePath[];
};

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

export type Conflict = { path: RelativeFilePath; kind: ConflictKind };

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
  for (const path of inputs.deletes) {
    if (!conflicted.has(path)) {
      files.removed.push(path);
    }
  }
  for (const { path } of inputs.writes) {
    if (conflicted.has(path)) {
      continue;
    }
    if (!base.has(path) && generated.get(path)?.status === 'A') {
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
  constructor(
    public readonly writes: readonly FileWrite[],
    public readonly deletes: readonly RelativeFilePath[],
    public readonly conflicts: readonly Conflict[],
    public readonly files: MergeFiles
  ) {}

  /** What git's merge means for the SDK directory: writes, deletions, conflicts, and the summary. */
  public static from(inputs: MergeInputs): MergePlan {
    const conflicts = conflictsOf(inputs.merge);
    const conflicted = new ValueSet(conflicts.map((conflict) => conflict.path));
    const yours = changedPaths(inputs.yours);
    const generated = changedPaths(inputs.generated);
    return new MergePlan(inputs.writes, inputs.deletes, conflicts, filesOf(inputs, conflicted, yours, generated));
  }

  public hasConflicts(): boolean {
    return this.conflicts.length > 0;
  }

  /** Whether the run would write nothing and remove nothing. */
  public isEmpty(): boolean {
    return this.writes.length === 0 && this.deletes.length === 0;
  }
}
