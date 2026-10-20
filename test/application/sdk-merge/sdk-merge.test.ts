import { MergePlan } from '../../../src/application/sdk-merge/merge-plan.js';
import { expect } from 'chai';
import { MergeInputs, planMerge } from '../../../src/application/sdk-merge/sdk-merge.js';
import { MergeTreeOutput } from '../../../src/application/sdk-merge/merge-tree-output.js';

const TREE = 't'.repeat(40);
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
  basePaths: [],
  ...overrides
});

const counts = (plan: MergePlan) =>
  Object.fromEntries(Object.entries(plan.files).map(([kind, paths]) => [kind, paths.length]));

describe('planMerge', () => {
  it('turns the diff from the disk to the merged tree into writes and deletions, counted by who changed what', () => {
    const plan = planMerge(
      inputs({
        basePaths: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
        yours: [
          { status: 'M', path: 'b.ts', blob: blob('by') },
          { status: 'M', path: 'c.ts', blob: blob('cy') }
        ],
        generated: [
          { status: 'M', path: 'a.ts', blob: blob('ag') },
          { status: 'M', path: 'b.ts', blob: blob('bg') },
          { status: 'D', path: 'd.ts' },
          { status: 'A', path: 'new.ts', blob: blob('ng') }
        ],
        applied: [
          { status: 'M', path: 'a.ts', blob: blob('ag') },
          { status: 'M', path: 'b.ts', blob: blob('bm') },
          { status: 'D', path: 'd.ts' },
          { status: 'A', path: 'new.ts', blob: blob('ng') }
        ]
      })
    );

    expect(plan.writes).to.deep.equal([
      { path: 'a.ts', blob: blob('ag') },
      { path: 'b.ts', blob: blob('bm') },
      { path: 'new.ts', blob: blob('ng') }
    ]);
    expect(plan.deletes).to.deep.equal(['d.ts']);
    expect(counts(plan)).to.deep.equal({ added: 1, updated: 1, merged: 1, removed: 1, kept: 1, unchanged: 1 });
    expect(plan.hasConflicts()).to.be.false;
  });

  it('names each conflict by its kind, from the message and from which stages are present', () => {
    const plan = planMerge(
      inputs({
        merge: merge({
          stages: [
            { mode: '100644', oid: blob('1'), stage: 1, path: 'deleted-by-you.ts' },
            { mode: '100644', oid: blob('3'), stage: 3, path: 'deleted-by-you.ts' },
            { mode: '100644', oid: blob('1'), stage: 1, path: 'dropped.ts' },
            { mode: '100644', oid: blob('2'), stage: 2, path: 'dropped.ts' }
          ],
          messages: [
            { paths: ['same.ts'], type: 'Auto-merging', message: 'Auto-merging same.ts' },
            {
              paths: ['same.ts'],
              type: 'CONFLICT (contents)',
              message: 'CONFLICT (content): Merge conflict in same.ts'
            },
            {
              paths: ['added.ts'],
              type: 'CONFLICT (contents)',
              message: 'CONFLICT (add/add): Merge conflict in added.ts'
            },
            { paths: ['logo.png'], type: 'CONFLICT (binary)', message: 'warning: Cannot merge binary files: logo.png' },
            {
              paths: ['logo.png'],
              type: 'CONFLICT (contents)',
              message: 'CONFLICT (content): Merge conflict in logo.png'
            },
            { paths: ['deleted-by-you.ts'], type: 'CONFLICT (modify/delete)', message: 'CONFLICT (modify/delete): …' },
            { paths: ['dropped.ts'], type: 'CONFLICT (modify/delete)', message: 'CONFLICT (modify/delete): …' },
            {
              paths: ['x.ts', 'y.ts'],
              type: 'CONFLICT (rename/rename)',
              message: 'CONFLICT (rename/rename): a.ts renamed to x.ts and y.ts'
            }
          ]
        }),
        applied: [
          { status: 'M', path: 'same.ts', blob: blob('m') },
          { status: 'A', path: 'deleted-by-you.ts', blob: blob('3') }
        ]
      })
    );

    expect(plan.conflicts).to.deep.equal([
      { path: 'same.ts', kind: 'bothChanged' },
      { path: 'added.ts', kind: 'bothAdded' },
      { path: 'logo.png', kind: 'binary' },
      { path: 'deleted-by-you.ts', kind: 'deletedByYou' },
      { path: 'dropped.ts', kind: 'noLongerGenerated' },
      { path: 'x.ts', kind: 'other', message: 'CONFLICT (rename/rename): a.ts renamed to x.ts and y.ts' },
      { path: 'y.ts', kind: 'other', message: 'CONFLICT (rename/rename): a.ts renamed to x.ts and y.ts' }
    ]);
    expect(plan.hasMarkers('same.ts')).to.be.true;
    expect(plan.hasMarkers('deleted-by-you.ts')).to.be.false;
    expect(counts(plan)).to.deep.equal({ added: 0, updated: 0, merged: 0, removed: 0, kept: 0, unchanged: 0 });
  });

  it('reports the renames each side made', () => {
    const plan = planMerge(
      inputs({
        basePaths: ['a.ts', 'b.ts'],
        yours: [{ status: 'R', from: 'a.ts', path: 'moved/a.ts', blob: blob('a') }],
        generated: [{ status: 'R', from: 'b.ts', path: 'b-model.ts', blob: blob('b') }]
      })
    );

    expect(plan.renames).to.deep.equal([
      { from: 'b.ts', to: 'b-model.ts', by: 'generator' },
      { from: 'a.ts', to: 'moved/a.ts', by: 'you' }
    ]);
  });
});
