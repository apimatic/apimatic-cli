import { ReadonlyValueMap, ValueMap, ValueSet } from '../common/value-map.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { Change, MergeMessage, MergeMessageKind, MergeTreeOutput, SIDE_STAGE, StageEntry } from '../git/merge-tree.js';
import { MergedText, Side } from './conflict-markers.js';
import {
  Conflict,
  ConflictKind,
  FileWrite,
  MarkedConflict,
  MergeFiles,
  PlacedConflict,
  Settlement,
  WholeConflict
} from './conflict.js';

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
  /** The generator's version of each conflicted path it still produces, as git kept it. */
  generatedVersions: ReadonlyValueMap<RelativeFilePath, Uint8Array>;
};

type ConflictFact = { path: RelativeFilePath; kind: ConflictKind };

/** The stronger of two accounts of one path, when git reports it more than once. */
const RANK: Record<ConflictKind, number> = {
  binary: 5,
  bothAdded: 4,
  deletedByYou: 3,
  noLongerGenerated: 3,
  bothChanged: 2,
  other: 1
};

/** Whether `side` still has the path, by the stage git kept for it. */
const has = (entries: readonly StageEntry[], side: Side): boolean =>
  entries.some((entry) => entry.stage === SIDE_STAGE[side]);

/** What a conflict git reported means here; a deletion is yours or the generator's by which side still has the file. */
function kindOf(reported: Exclude<MergeMessageKind, 'informational'>, entries: readonly StageEntry[]): ConflictKind {
  switch (reported) {
    case 'binary':
      return 'binary';
    case 'addAdd':
      return 'bothAdded';
    case 'modifyDelete':
    case 'renameDelete':
      return has(entries, 'yours') ? 'noLongerGenerated' : 'deletedByYou';
    case 'contents':
      return 'bothChanged';
    case 'otherConflict':
      return 'other';
  }
}

/** The stages git kept for each conflicted path. */
function stagesByPath(entries: readonly StageEntry[]): ValueMap<RelativeFilePath, StageEntry[]> {
  const stages = new ValueMap<RelativeFilePath, StageEntry[]>();
  for (const entry of entries) {
    stages.set(entry.path, [...(stages.get(entry.path) ?? []), entry]);
  }
  return stages;
}

function conflictsOf(
  messages: readonly MergeMessage[],
  stages: ValueMap<RelativeFilePath, StageEntry[]>
): ConflictFact[] {
  const byPath = new ValueMap<RelativeFilePath, ConflictFact>();
  for (const { paths, kind: reported } of messages) {
    if (reported === 'informational') {
      continue;
    }
    for (const path of paths) {
      const kind = kindOf(reported, stages.get(path) ?? []);
      const known = byPath.get(path);
      if (known === undefined || RANK[kind] > RANK[known.kind]) {
        byPath.set(path, { path, kind });
      }
    }
  }
  return byPath.values();
}

/** The conflict as the object that knows how it lands: marked blocks, a whole file a side takes, or git's placement. */
function conflictOf(
  fact: ConflictFact,
  placed: FileWrite | undefined,
  entries: readonly StageEntry[],
  generatedVersion: Uint8Array | undefined
): Conflict {
  const asPlaced = placed === undefined ? [] : [placed];
  if (fact.kind === 'other') {
    return new PlacedConflict(fact.path, entries, asPlaced);
  }
  if (placed !== undefined && (fact.kind === 'bothChanged' || fact.kind === 'bothAdded')) {
    return new MarkedConflict(fact.path, fact.kind, entries, MergedText.parse(placed.content));
  }
  // A file git marked but did not need to write, since the disk already holds the merge, lands whole like one a side deleted.
  const yours = has(entries, 'yours') ? Settlement.kept(fact.path) : Settlement.untouched();
  // A generation that no longer produces the file leaves yours in place for either side, so an edit is never thrown away by a choice that keeps the rest.
  const generated =
    generatedVersion === undefined ? yours : Settlement.updated({ path: fact.path, content: generatedVersion });
  return new WholeConflict(fact.path, fact.kind, entries, asPlaced, generated, yours);
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

/** What the summary reports: every path git did not name in a conflict, by what happened to it. */
function filesOf(
  inputs: MergeInputs,
  inConflict: ValueSet<RelativeFilePath>,
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
    if (!inConflict.has(path)) {
      files.removed.push(path);
    }
  }
  for (const { path } of inputs.writes) {
    if (inConflict.has(path)) {
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
    if ((change.status === 'M' || change.status === 'A') && !generated.has(path) && !inConflict.has(path)) {
      files.kept.push(change.path);
    }
  }
  return files;
}

/** What a run writes and removes below the SDK directory; a path the plan does not mention is left as it is. */
export class MergePlan {
  /** Every file the run writes when the conflicts are left for you: the merged ones, and each conflicted one as git placed it. */
  public readonly writes: readonly FileWrite[];

  constructor(
    private readonly uncontested: readonly FileWrite[],
    public readonly deletes: readonly RelativeFilePath[],
    public readonly conflicts: readonly Conflict[],
    public readonly files: MergeFiles
  ) {
    this.writes = [...uncontested, ...conflicts.flatMap((conflict) => conflict.asPlaced())];
  }

  /** A plan that touches nothing, for settlements to land on. */
  public static empty(): MergePlan {
    return new MergePlan([], [], [], { added: [], updated: [], merged: [], removed: [], kept: [] });
  }

  /** What git's merge means for the SDK directory: writes, deletions, conflicts, and the summary. */
  public static from(inputs: MergeInputs): MergePlan {
    const stages = stagesByPath(inputs.merge.stages);
    const placed = new ValueMap(inputs.writes.map((write): [RelativeFilePath, FileWrite] => [write.path, write]));
    const facts = conflictsOf(inputs.merge.messages, stages);
    const inConflict = new ValueSet(facts.map((fact) => fact.path));
    // A path git names that the merge leaves nowhere, neither staged nor written, such as the old name of a file it moved or you deleted, is no file to settle, and the summary leaves it out as well.
    const conflicts = facts
      .filter(({ path }) => stages.has(path) || placed.has(path))
      .map((fact) =>
        conflictOf(fact, placed.get(fact.path), stages.get(fact.path) ?? [], inputs.generatedVersions.get(fact.path))
      );
    return new MergePlan(
      inputs.writes.filter((write) => !inConflict.has(write.path)),
      inputs.deletes,
      conflicts,
      filesOf(inputs, inConflict, changedPaths(inputs.yours), changedPaths(inputs.generated))
    );
  }

  /** Every conflicted path's versions as git keeps them, for the index to hold as a merge would leave it. */
  public get stages(): readonly StageEntry[] {
    return this.conflicts.flatMap((conflict) => conflict.stages);
  }

  /** This plan with `settlements` landed beside its own writes and removals, its conflicts gone, each settlement counted into the summary. */
  public settled(settlements: readonly Settlement[]): MergePlan {
    return new MergePlan(
      [...this.uncontested, ...settlements.flatMap((settlement) => settlement.writes())],
      [...this.deletes, ...settlements.flatMap((settlement) => settlement.removes())],
      [],
      settlements.reduce((files, settlement) => settlement.countedIn(files), this.files)
    );
  }

  /** Every conflict settled for `side`, as the question's answer is. */
  public taking(side: Side): MergePlan {
    return this.settled(this.conflicts.map((conflict) => conflict.settledFor(side)));
  }

  public hasConflicts(): boolean {
    return this.conflicts.length > 0;
  }

  /** Whether the run would write nothing, remove nothing, and leave nothing in conflict. */
  public isEmpty(): boolean {
    return this.writes.length === 0 && this.deletes.length === 0 && this.conflicts.length === 0;
  }

  public conflictedPaths(): RelativeFilePath[] {
    return this.conflicts.map((conflict) => conflict.path);
  }

  /** The conflicted files written with markers in them, for a merge tool to find. */
  public markedPaths(): RelativeFilePath[] {
    return this.conflicts.filter((conflict) => conflict.leavesMarkers()).map((conflict) => conflict.path);
  }

  /** The conflicted files left whole, for you to keep or remove. */
  public unmarkedPaths(): RelativeFilePath[] {
    return this.conflicts.filter((conflict) => !conflict.leavesMarkers()).map((conflict) => conflict.path);
  }
}
