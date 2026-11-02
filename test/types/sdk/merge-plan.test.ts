import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { BlobId } from '../../../src/types/git/blob-id.js';
import { MergeTreeOutput } from '../../../src/types/git/merge-tree.js';
import { TreeId } from '../../../src/types/git/tree-id.js';
import { MergeInputs, MergePlan } from '../../../src/types/sdk/merge-plan.js';

const TREE = TreeId.fromGit('c'.repeat(40))!;
const blob = (name: string) => BlobId.fromGit(Buffer.from(name).toString('hex').padEnd(40, '0'))!;
const rel = (value: string) => RelativeFilePath.fromGit(value)!;
const bytes = (text: string) => new Uint8Array(Buffer.from(text));

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
  ...overrides
});

const counts = (plan: MergePlan) =>
  Object.fromEntries(Object.entries(plan.files).map(([kind, paths]) => [kind, paths.length]));

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
    expect(counts(plan)).to.deep.equal({ added: 1, updated: 1, merged: 1, removed: 1, kept: 1 });
    expect(plan.hasConflicts()).to.be.false;
    expect(plan.isEmpty()).to.be.false;
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
            { paths: ['same.ts'].map(rel), kind: 'informational', message: 'Auto-merging same.ts' },
            { paths: ['same.ts'].map(rel), kind: 'contents', message: 'CONFLICT (content): Merge conflict in same.ts' },
            { paths: ['added.ts'].map(rel), kind: 'addAdd', message: 'CONFLICT (add/add): Merge conflict in added.ts' },
            { paths: ['logo.png'].map(rel), kind: 'binary', message: 'warning: Cannot merge binary files: logo.png' },
            {
              paths: ['logo.png'].map(rel),
              kind: 'contents',
              message: 'CONFLICT (content): Merge conflict in logo.png'
            },
            { paths: ['deleted-by-you.ts'].map(rel), kind: 'modifyDelete', message: 'CONFLICT (modify/delete): …' },
            { paths: ['dropped.ts'].map(rel), kind: 'modifyDelete', message: 'CONFLICT (modify/delete): …' },
            {
              paths: ['x.ts', 'y.ts'].map(rel),
              kind: 'otherConflict',
              message: 'CONFLICT (rename/rename): a.ts renamed to x.ts and y.ts'
            }
          ]
        }),
        writes: [
          { path: rel('same.ts'), content: bytes('m') },
          { path: rel('deleted-by-you.ts'), content: bytes('3') }
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
    expect(plan.hasConflicts()).to.be.true;
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
    expect(plan.isEmpty()).to.be.true;
  });
});
