import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { expect } from 'chai';
import { MergeTreeOutput } from '../../../src/types/git/merge-tree.js';
import { TreeId } from '../../../src/types/git/tree-id.js';
import { ConflictKind, MergeInputs, MergePlan } from '../../../src/types/sdk/merge-plan.js';

const TREE = TreeId.fromGit('t'.repeat(40));
const blob = (name: string) => name.padEnd(40, '0');

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
  applied: [],
  basePaths: [].map(rel),
  ...overrides
});

const counts = (plan: MergePlan) =>
  Object.fromEntries(Object.entries(plan.files).map(([kind, paths]) => [kind, paths.length]));

const rel = (value: string) => RelativeFilePath.fromGit(value);

describe('MergePlan.from', () => {
  it('turns the diff from the disk to the merged tree into writes and deletions, counted by who changed what', () => {
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
        applied: [
          { status: 'M', path: rel('a.ts'), blob: blob('ag') },
          { status: 'M', path: rel('b.ts'), blob: blob('bm') },
          { status: 'D', path: rel('d.ts') },
          { status: 'A', path: rel('new.ts'), blob: blob('ng') }
        ]
      })
    );

    expect(plan.writes).to.deep.equal([
      { path: rel('a.ts'), blob: blob('ag') },
      { path: rel('b.ts'), blob: blob('bm') },
      { path: rel('new.ts'), blob: blob('ng') }
    ]);
    expect(plan.deletes).to.deep.equal(['d.ts'].map(rel));
    expect(counts(plan)).to.deep.equal({ added: 1, updated: 1, merged: 1, removed: 1, kept: 1 });
    expect(plan.hasConflicts()).to.be.false;
  });

  it('names each conflict by its kind, from the message and from which stages are present', () => {
    const plan = MergePlan.from(
      inputs({
        merge: merge({
          stages: [
            { mode: '100644', oid: blob('1'), stage: 1, path: rel('deleted-by-you.ts') },
            { mode: '100644', oid: blob('3'), stage: 3, path: rel('deleted-by-you.ts') },
            { mode: '100644', oid: blob('1'), stage: 1, path: rel('dropped.ts') },
            { mode: '100644', oid: blob('2'), stage: 2, path: rel('dropped.ts') }
          ],
          messages: [
            { paths: ['same.ts'].map(rel), type: 'Auto-merging', message: 'Auto-merging same.ts' },
            {
              paths: ['same.ts'].map(rel),
              type: 'CONFLICT (contents)',
              message: 'CONFLICT (content): Merge conflict in same.ts'
            },
            {
              paths: ['added.ts'].map(rel),
              type: 'CONFLICT (contents)',
              message: 'CONFLICT (add/add): Merge conflict in added.ts'
            },
            {
              paths: ['logo.png'].map(rel),
              type: 'CONFLICT (binary)',
              message: 'warning: Cannot merge binary files: logo.png'
            },
            {
              paths: ['logo.png'].map(rel),
              type: 'CONFLICT (contents)',
              message: 'CONFLICT (content): Merge conflict in logo.png'
            },
            {
              paths: ['deleted-by-you.ts'].map(rel),
              type: 'CONFLICT (modify/delete)',
              message: 'CONFLICT (modify/delete): …'
            },
            {
              paths: ['dropped.ts'].map(rel),
              type: 'CONFLICT (modify/delete)',
              message: 'CONFLICT (modify/delete): …'
            },
            {
              paths: ['x.ts', 'y.ts'].map(rel),
              type: 'CONFLICT (rename/rename)',
              message: 'CONFLICT (rename/rename): a.ts renamed to x.ts and y.ts'
            }
          ]
        }),
        applied: [
          { status: 'M', path: rel('same.ts'), blob: blob('m') },
          { status: 'A', path: rel('deleted-by-you.ts'), blob: blob('3') }
        ]
      })
    );

    expect(plan.conflicts).to.deep.equal([
      { path: rel('same.ts'), kind: 'bothChanged' },
      { path: rel('added.ts'), kind: 'bothAdded' },
      { path: rel('logo.png'), kind: 'binary' },
      { path: rel('deleted-by-you.ts'), kind: 'deletedByYou' },
      { path: rel('dropped.ts'), kind: 'noLongerGenerated' },
      { path: rel('x.ts'), kind: 'other' },
      { path: rel('y.ts'), kind: 'other' }
    ]);
    expect(plan.hasMarkers(rel('same.ts'))).to.be.true;
    expect(plan.hasMarkers(rel('deleted-by-you.ts'))).to.be.false;
    expect(counts(plan)).to.deep.equal({ added: 0, updated: 0, merged: 0, removed: 0, kept: 0 });
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
  });

  /** One conflict of each kind, next to a clean change to `other.ts`. */
  const conflicted = () =>
    MergePlan.from(
      inputs({
        basePaths: ['same.ts', 'dropped.ts', 'deleted-by-you.ts', 'logo.png', 'other.ts'].map(rel),
        yours: [
          { status: 'M', path: rel('same.ts'), blob: blob('sy') },
          { status: 'M', path: rel('dropped.ts'), blob: blob('dy') },
          { status: 'D', path: rel('deleted-by-you.ts') },
          { status: 'M', path: rel('logo.png'), blob: blob('ly') },
          { status: 'A', path: rel('added.ts'), blob: blob('ay') }
        ],
        generated: [
          { status: 'M', path: rel('same.ts'), blob: blob('sg') },
          { status: 'D', path: rel('dropped.ts') },
          { status: 'M', path: rel('deleted-by-you.ts'), blob: blob('bg') },
          { status: 'M', path: rel('logo.png'), blob: blob('lg') },
          { status: 'A', path: rel('added.ts'), blob: blob('ag') },
          { status: 'M', path: rel('other.ts'), blob: blob('og') }
        ],
        applied: [
          { status: 'M', path: rel('same.ts'), blob: blob('sm') },
          { status: 'A', path: rel('deleted-by-you.ts'), blob: blob('bg') },
          { status: 'M', path: rel('added.ts'), blob: blob('am') },
          { status: 'M', path: rel('other.ts'), blob: blob('og') }
        ],
        merge: merge({
          stages: [
            { mode: '100644', oid: blob('1'), stage: 1, path: rel('deleted-by-you.ts') },
            { mode: '100644', oid: blob('3'), stage: 3, path: rel('deleted-by-you.ts') },
            { mode: '100644', oid: blob('1'), stage: 1, path: rel('dropped.ts') },
            { mode: '100644', oid: blob('2'), stage: 2, path: rel('dropped.ts') }
          ],
          messages: [
            {
              paths: ['same.ts'].map(rel),
              type: 'CONFLICT (contents)',
              message: 'CONFLICT (content): Merge conflict in same.ts'
            },
            {
              paths: ['added.ts'].map(rel),
              type: 'CONFLICT (contents)',
              message: 'CONFLICT (add/add): Merge conflict in added.ts'
            },
            {
              paths: ['logo.png'].map(rel),
              type: 'CONFLICT (binary)',
              message: 'warning: Cannot merge binary files: logo.png'
            },
            {
              paths: ['deleted-by-you.ts'].map(rel),
              type: 'CONFLICT (modify/delete)',
              message: 'CONFLICT (modify/delete): …'
            },
            { paths: ['dropped.ts'].map(rel), type: 'CONFLICT (modify/delete)', message: 'CONFLICT (modify/delete): …' }
          ]
        })
      })
    );

  it('settles every conflict the generator’s way when asked to, keeping an edited file it no longer produces', () => {
    const plan = conflicted();

    const settled = plan.taking('generated');

    expect(settled.hasConflicts()).to.be.false;
    expect(settled.writes).to.have.deep.members([
      { path: rel('other.ts'), blob: blob('og') },
      { path: rel('same.ts'), blob: blob('sm'), settle: 'generated' },
      { path: rel('added.ts'), blob: blob('am'), settle: 'generated' },
      { path: rel('logo.png'), blob: blob('lg') },
      { path: rel('deleted-by-you.ts'), blob: blob('bg') }
    ]);
    expect(settled.deletes).to.deep.equal([]);
    expect(settled.files.updated.map(String)).to.have.members(['other.ts', 'logo.png', 'deleted-by-you.ts']);
    expect(settled.files.merged.map(String)).to.have.members(['same.ts', 'added.ts']);
    expect(settled.files.kept.map(String)).to.deep.equal(['dropped.ts']);
    expect(settled.files.removed).to.deep.equal([]);
    expect(plan.hasConflicts()).to.be.true;
  });

  it('leaves a conflict of another shape as git placed it, for either side', () => {
    const plan = MergePlan.from(
      inputs({
        basePaths: ['models/book.ts'].map(rel),
        yours: [{ status: 'A', path: rel('models/custom.ts'), blob: blob('cy') }],
        generated: [{ status: 'R', from: rel('models/book.ts'), path: rel('model/book.ts'), blob: blob('bg') }],
        applied: [
          { status: 'D', path: rel('models/book.ts') },
          { status: 'A', path: rel('model/book.ts'), blob: blob('bg') },
          { status: 'D', path: rel('models/custom.ts') },
          { status: 'A', path: rel('model/custom.ts'), blob: blob('cy') }
        ],
        merge: merge({
          messages: [
            {
              paths: ['model/custom.ts'].map(rel),
              type: 'CONFLICT (file location)',
              message: 'CONFLICT (file location): models/custom.ts added inside a directory that was renamed'
            }
          ]
        })
      })
    );

    for (const side of ['generated', 'yours'] as const) {
      const settled = plan.taking(side);
      expect(settled.writes).to.deep.equal(plan.writes);
      expect(settled.deletes).to.deep.equal(plan.deletes);
      expect(settled.files.kept.map(String)).to.deep.equal(['models/custom.ts']);
      expect(settled.hasConflicts()).to.be.false;
    }
  });

  it('settles every conflict your way when asked to: your lines in each marked block, and a whole file left as it is on disk', () => {
    const plan = conflicted();

    const settled = plan.taking('yours');

    expect(settled.hasConflicts()).to.be.false;
    expect(settled.writes).to.have.deep.members([
      { path: rel('other.ts'), blob: blob('og') },
      { path: rel('same.ts'), blob: blob('sm'), settle: 'yours' },
      { path: rel('added.ts'), blob: blob('am'), settle: 'yours' }
    ]);
    expect(settled.deletes).to.deep.equal([]);
    expect(settled.files.merged.map(String)).to.have.members(['same.ts', 'added.ts']);
    expect(settled.files.kept.map(String)).to.have.members(['logo.png', 'dropped.ts']);
    expect(settled.files.updated.map(String)).to.deep.equal(['other.ts']);
    expect(settled.files.removed).to.deep.equal([]);
  });

  it('does not bring back a path the generator renamed away when its deletion is settled for the generator', () => {
    const plan = MergePlan.from(
      inputs({
        basePaths: ['old.ts'].map(rel),
        yours: [{ status: 'D', path: rel('old.ts') }],
        generated: [{ status: 'R', from: rel('old.ts'), path: rel('new.ts'), blob: blob('n') }],
        applied: [{ status: 'A', path: rel('new.ts'), blob: blob('n') }],
        merge: merge({
          stages: [
            { mode: '100644', oid: blob('1'), stage: 1, path: rel('old.ts') },
            { mode: '100644', oid: blob('3'), stage: 3, path: rel('old.ts') }
          ],
          messages: [
            { paths: ['old.ts'].map(rel), type: 'CONFLICT (rename/delete)', message: 'CONFLICT (rename/delete): …' }
          ]
        })
      })
    );

    const settled = plan.taking('generated');

    expect(settled.writes).to.deep.equal([{ path: rel('new.ts'), blob: blob('n') }]);
    expect(settled.deletes).to.deep.equal([]);
  });

  it('tells the conflicts that leave markers in the file from those that leave it whole', () => {
    const marks = (...kinds: ConflictKind[]) => {
      const conflicts = kinds.map((kind, index) => ({ path: rel(`${index}.ts`), kind }));
      const plan = new MergePlan([], [], conflicts, MergePlan.from(inputs({})).files);
      return [plan.hasMarkedConflicts(), plan.hasUnmarkedConflicts()];
    };

    expect(marks('bothChanged', 'bothAdded')).to.deep.equal([true, false]);
    expect(marks('deletedByYou', 'noLongerGenerated', 'binary', 'other')).to.deep.equal([false, true]);
    expect(marks('bothChanged', 'binary')).to.deep.equal([true, true]);
    expect(marks()).to.deep.equal([false, false]);
  });
});
