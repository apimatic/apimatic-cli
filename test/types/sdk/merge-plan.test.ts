import { expect } from 'chai';
import { ValueMap } from '../../../src/types/common/value-map.js';
import { MergeMessage, MergeTreeOutput } from '../../../src/types/git/merge-tree.js';
import { TreeId } from '../../../src/types/git/tree-id.js';
import { GENERATED_MARKER, YOURS_MARKER } from '../../../src/types/sdk/conflict-markers.js';
import { FileWrite, Settlement } from '../../../src/types/sdk/conflict.js';
import { MergeInputs, MergePlan } from '../../../src/types/sdk/merge-plan.js';
import { blob, bytes, counts, kinds, markedByGit, named, rel, SIDES, stage, written } from '../../helpers/merge.js';

const TREE = TreeId.fromGit('c'.repeat(40))!;

const merge = (overrides: Partial<MergeTreeOutput> = {}): MergeTreeOutput => ({
  tree: TREE,
  stages: [],
  messages: [],
  ...overrides
});

const inputs = (overrides: Partial<MergeInputs>): MergeInputs => ({
  merge: merge(),
  yours: [],
  generated: [],
  writes: [],
  deletes: [],
  basePaths: [],
  generatedVersions: new ValueMap(),
  ...overrides
});

const conflict = (kind: MergeMessage['kind'], ...paths: string[]): MergeMessage => ({
  paths: paths.map(rel),
  kind,
  message: `CONFLICT: ${paths.join(', ')}`
});

/** Five conflicts of every kind but `other`, a clean file beside them, and one the generator dropped that you never touched. */
const CONFLICTED: MergeInputs = inputs({
  merge: merge({
    stages: [
      stage('logo.png', 1),
      stage('logo.png', 2),
      stage('logo.png', 3),
      stage('deleted-by-you.ts', 1),
      stage('deleted-by-you.ts', 3),
      stage('dropped.ts', 1),
      stage('dropped.ts', 2)
    ],
    messages: [
      { paths: ['same.ts'].map(rel), kind: 'informational', message: 'Auto-merging same.ts' },
      conflict('contents', 'same.ts'),
      conflict('addAdd', 'added.ts'),
      conflict('binary', 'logo.png'),
      conflict('contents', 'logo.png'),
      conflict('modifyDelete', 'deleted-by-you.ts'),
      conflict('modifyDelete', 'dropped.ts')
    ]
  }),
  basePaths: ['same.ts', 'logo.png', 'deleted-by-you.ts', 'dropped.ts', 'other.ts', 'gone.ts'].map(rel),
  yours: [
    { status: 'M', path: rel('same.ts'), blob: blob('sy') },
    { status: 'A', path: rel('added.ts'), blob: blob('ay') },
    { status: 'M', path: rel('logo.png'), blob: blob('ly') },
    { status: 'D', path: rel('deleted-by-you.ts') },
    { status: 'M', path: rel('dropped.ts'), blob: blob('dy') }
  ],
  generated: [
    { status: 'M', path: rel('same.ts'), blob: blob('sg') },
    { status: 'A', path: rel('added.ts'), blob: blob('ag') },
    { status: 'M', path: rel('logo.png'), blob: blob('lg') },
    { status: 'M', path: rel('deleted-by-you.ts'), blob: blob('bg') },
    { status: 'D', path: rel('dropped.ts') },
    { status: 'M', path: rel('other.ts'), blob: blob('og') },
    { status: 'D', path: rel('gone.ts') }
  ],
  writes: [
    { path: rel('same.ts'), content: bytes(markedByGit('same mine', 'same theirs')) },
    { path: rel('added.ts'), content: bytes(markedByGit('added mine', 'added theirs')) },
    { path: rel('deleted-by-you.ts'), content: bytes('bg') },
    { path: rel('other.ts'), content: bytes('og') }
  ],
  deletes: ['gone.ts'].map(rel),
  generatedVersions: new ValueMap([
    [rel('logo.png'), bytes('lg')],
    [rel('deleted-by-you.ts'), bytes('bg')]
  ])
});

const conflicted = (more: Partial<MergeInputs> = {}) => MergePlan.from({ ...CONFLICTED, ...more });

/** A file the generator renamed and you deleted, which git names by both names. */
const renamedAway = () =>
  MergePlan.from(
    inputs({
      merge: merge({
        stages: [stage('new.ts', 1), stage('new.ts', 3)],
        messages: [conflict('renameDelete', 'old.ts', 'new.ts')]
      }),
      basePaths: ['old.ts'].map(rel),
      yours: [{ status: 'D', path: rel('old.ts') }],
      generated: [{ status: 'R', from: rel('old.ts'), path: rel('new.ts'), blob: blob('n') }],
      writes: [{ path: rel('new.ts'), content: bytes('n') }],
      generatedVersions: new ValueMap([[rel('new.ts'), bytes('n')]])
    })
  );

/** A file you added inside a directory the generator renamed, which the merge moves along and git names by both names. */
const movedWithDirectory = () =>
  MergePlan.from(
    inputs({
      merge: merge({ messages: [conflict('otherConflict', 'model/custom.ts', 'models/custom.ts')] }),
      basePaths: ['models/book.ts'].map(rel),
      yours: [{ status: 'A', path: rel('models/custom.ts'), blob: blob('c') }],
      generated: [{ status: 'R', from: rel('models/book.ts'), path: rel('model/book.ts'), blob: blob('b') }],
      writes: [
        { path: rel('model/book.ts'), content: bytes('b') },
        { path: rel('model/custom.ts'), content: bytes('c') }
      ],
      deletes: ['models/book.ts', 'models/custom.ts'].map(rel)
    })
  );

describe('MergePlan.from', () => {
  it('passes the writes and deletions through, counted by who changed what', () => {
    const plan = MergePlan.from(
      inputs({
        basePaths: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map(rel),
        yours: [
          { status: 'M', path: rel('b.ts'), blob: blob('by') },
          { status: 'M', path: rel('c.ts'), blob: blob('cy') }
        ],
        generated: [
          { status: 'M', path: rel('a.ts'), blob: blob('ag') },
          { status: 'M', path: rel('b.ts'), blob: blob('bg') },
          { status: 'D', path: rel('d.ts') },
          { status: 'A', path: rel('new.ts'), blob: blob('ng') }
        ],
        writes: [
          { path: rel('a.ts'), content: bytes('ag') },
          { path: rel('b.ts'), content: bytes('bm') },
          { path: rel('new.ts'), content: bytes('ng') }
        ],
        deletes: ['d.ts'].map(rel)
      })
    );

    expect(plan.writes).to.deep.equal([
      { path: rel('a.ts'), content: bytes('ag') },
      { path: rel('b.ts'), content: bytes('bm') },
      { path: rel('new.ts'), content: bytes('ng') }
    ]);
    expect(plan.deletes).to.deep.equal(['d.ts'].map(rel));
    expect(counts(plan.files)).to.deep.equal({ added: 1, updated: 1, merged: 1, removed: 1, kept: 1 });
    expect(plan.hasConflicts()).to.be.false;
    expect(plan.isEmpty()).to.be.false;
  });

  it('names each conflict by its kind, from the message and from which stages are present', () => {
    const other: FileWrite[] = [
      { path: rel('x.ts'), content: bytes('x') },
      { path: rel('y.ts'), content: bytes('y') }
    ];
    const plan = conflicted({
      merge: merge({
        stages: CONFLICTED.merge.stages,
        messages: [...CONFLICTED.merge.messages, conflict('otherConflict', 'x.ts', 'y.ts')]
      }),
      writes: [...CONFLICTED.writes, ...other]
    });

    expect(kinds(plan.conflicts)).to.deep.equal([
      ['same.ts', 'bothChanged'],
      ['added.ts', 'bothAdded'],
      ['logo.png', 'binary'],
      ['deleted-by-you.ts', 'deletedByYou'],
      ['dropped.ts', 'noLongerGenerated'],
      ['x.ts', 'other'],
      ['y.ts', 'other']
    ]);
    expect(plan.hasConflicts()).to.be.true;
    expect(counts(plan.files)).to.deep.equal({ added: 0, updated: 1, merged: 0, removed: 1, kept: 0 });
  });

  it('takes the stronger account of a path git reports twice, whichever comes first', () => {
    for (const order of [
      ['binary', 'contents'],
      ['contents', 'binary']
    ] as const) {
      const plan = MergePlan.from(
        inputs({
          merge: merge({
            stages: [stage('logo.png', 1), stage('logo.png', 2), stage('logo.png', 3)],
            messages: order.map((kind) => conflict(kind, 'logo.png'))
          })
        })
      );

      expect(kinds(plan.conflicts), order.join(' then ')).to.deep.equal([['logo.png', 'binary']]);
    }
  });

  it('leaves out a path git names that the merge leaves nowhere, such as the old name of a file the generator renamed and you deleted', () => {
    const plan = renamedAway();

    expect(kinds(plan.conflicts)).to.deep.equal([['new.ts', 'deletedByYou']]);
    expect(plan.stages).to.deep.equal([stage('new.ts', 1), stage('new.ts', 3)]);
    expect(counts(plan.files)).to.deep.equal({ added: 0, updated: 0, merged: 0, removed: 0, kept: 0 });
  });

  it('names a file the merge moved into a directory the generator renamed by its new path alone, and counts neither', () => {
    const plan = movedWithDirectory();

    expect(kinds(plan.conflicts)).to.deep.equal([['model/custom.ts', 'other']]);
    expect(plan.stages).to.deep.equal([]);
    expect(named(plan.files)).to.deep.equal({
      added: [],
      updated: ['model/book.ts'],
      merged: [],
      removed: ['models/book.ts'],
      kept: []
    });
  });

  it('counts a file you added, which the generator never produced, among the kept ones', () => {
    const plan = MergePlan.from(
      inputs({
        basePaths: ['a.ts'].map(rel),
        yours: [
          { status: 'A', path: rel('mine.ts'), blob: blob('m') },
          { status: 'A', path: rel('both.ts'), blob: blob('b') }
        ],
        generated: [{ status: 'A', path: rel('both.ts'), blob: blob('b') }]
      })
    );

    expect(plan.files.kept.map(String)).to.deep.equal(['mine.ts']);
    expect(plan.writes).to.deep.equal([]);
    expect(plan.isEmpty()).to.be.true;
  });

  it('is not empty while a conflict is left, even one that writes nothing, so the run never reports nothing changed above it', () => {
    const plan = MergePlan.from(
      inputs({
        merge: merge({
          stages: [stage('dropped.ts', 1), stage('dropped.ts', 2)],
          messages: [conflict('modifyDelete', 'dropped.ts')]
        }),
        basePaths: ['dropped.ts'].map(rel),
        yours: [{ status: 'M', path: rel('dropped.ts'), blob: blob('dy') }],
        generated: [{ status: 'D', path: rel('dropped.ts') }]
      })
    );

    expect(kinds(plan.conflicts)).to.deep.equal([['dropped.ts', 'noLongerGenerated']]);
    expect(plan.writes).to.deep.equal([]);
    expect(plan.deletes).to.deep.equal([]);
    expect(plan.isEmpty()).to.be.false;
  });

  it('writes the merge as git made it when the developer resolves, markers and all, with the CLI’s labels, and keeps every stage', () => {
    const plan = conflicted();

    expect(written(plan.writes)).to.have.deep.members([
      ['other.ts', 'og'],
      ['same.ts', `${YOURS_MARKER}\nsame mine\n=======\nsame theirs\n${GENERATED_MARKER}\n`],
      ['added.ts', `${YOURS_MARKER}\nadded mine\n=======\nadded theirs\n${GENERATED_MARKER}\n`],
      ['deleted-by-you.ts', 'bg']
    ]);
    expect(plan.deletes).to.deep.equal(['gone.ts'].map(rel));
    expect(plan.hasConflicts()).to.be.true;
    expect(plan.stages).to.deep.equal(CONFLICTED.merge.stages);
    expect(named(plan.files)).to.deep.equal({
      added: [],
      updated: ['other.ts'],
      merged: [],
      removed: ['gone.ts'],
      kept: []
    });
  });
});

describe('MergePlan.taking', () => {
  it('settles every conflict the generator’s way when asked to, keeping an edited file it no longer produces', () => {
    const plan = conflicted();

    const taken = plan.taking('generated');

    expect(written(taken.writes)).to.have.deep.members([
      ['other.ts', 'og'],
      ['same.ts', 'same theirs\n'],
      ['added.ts', 'added theirs\n'],
      ['logo.png', 'lg'],
      ['deleted-by-you.ts', 'bg']
    ]);
    expect(taken.deletes).to.deep.equal(['gone.ts'].map(rel));
    expect(taken.hasConflicts()).to.be.false;
    expect(taken.stages).to.deep.equal([]);
    expect(named(taken.files).updated).to.have.members(['other.ts', 'logo.png', 'deleted-by-you.ts']);
    expect(named(taken.files).merged).to.deep.equal(['same.ts', 'added.ts']);
    expect(named(taken.files).kept).to.deep.equal(['dropped.ts']);
    expect(named(taken.files).removed).to.deep.equal(['gone.ts']);
    expect(plan.hasConflicts()).to.be.true;
  });

  it('settles every conflict your way when asked to: your lines in each marked block, and a whole file left as it is on disk', () => {
    const taken = conflicted().taking('yours');

    expect(written(taken.writes)).to.have.deep.members([
      ['other.ts', 'og'],
      ['same.ts', 'same mine\n'],
      ['added.ts', 'added mine\n']
    ]);
    expect(taken.deletes).to.deep.equal(['gone.ts'].map(rel));
    expect(taken.hasConflicts()).to.be.false;
    expect(named(taken.files).merged).to.deep.equal(['same.ts', 'added.ts']);
    expect(named(taken.files).kept).to.have.members(['logo.png', 'dropped.ts']);
    expect(named(taken.files).updated).to.deep.equal(['other.ts']);
    expect(named(taken.files).removed).to.deep.equal(['gone.ts']);
  });

  it('leaves a conflict of another shape as git placed it, for either side, counting the file as updated', () => {
    const plan = movedWithDirectory();

    for (const side of SIDES) {
      const taken = plan.taking(side);

      expect(taken.writes, side).to.deep.equal(plan.writes);
      expect(taken.deletes, side).to.deep.equal(plan.deletes);
      expect(taken.hasConflicts(), side).to.be.false;
      expect(named(taken.files), side).to.deep.equal({
        ...named(plan.files),
        updated: [...named(plan.files).updated, 'model/custom.ts']
      });
    }
  });

  it('does not bring back a path the generator renamed away when its deletion is settled for the generator', () => {
    const plan = renamedAway();

    expect(written(plan.taking('generated').writes)).to.deep.equal([['new.ts', 'n']]);
    expect(plan.taking('generated').deletes).to.deep.equal([]);
    expect(written(plan.taking('yours').writes)).to.deep.equal([]);
  });
});

describe('MergePlan.settled', () => {
  it('starts empty and lands settlements beside its own writes and removals, counting each', () => {
    const plan = MergePlan.empty().settled([
      Settlement.merged({ path: rel('a.ts'), content: bytes('a') }),
      Settlement.removed(rel('b.ts')),
      Settlement.kept(rel('c.ts'))
    ]);

    expect(written(plan.writes)).to.deep.equal([['a.ts', 'a']]);
    expect(plan.deletes.map(String)).to.deep.equal(['b.ts']);
    expect(plan.hasConflicts()).to.be.false;
    expect(named(plan.files)).to.deep.equal({
      added: [],
      updated: [],
      merged: ['a.ts'],
      removed: ['b.ts'],
      kept: ['c.ts']
    });
    expect(MergePlan.empty().isEmpty()).to.be.true;
  });

  it('names the conflicted paths, and tells those whose file carries markers from the rest', () => {
    const plan = conflicted();

    expect(plan.conflictedPaths().map(String)).to.deep.equal([
      'same.ts',
      'added.ts',
      'logo.png',
      'deleted-by-you.ts',
      'dropped.ts'
    ]);
    expect(plan.markedPaths().map(String)).to.deep.equal(['same.ts', 'added.ts']);
    expect(plan.unmarkedPaths().map(String)).to.deep.equal(['logo.png', 'deleted-by-you.ts', 'dropped.ts']);
  });
});
