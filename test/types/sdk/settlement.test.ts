import { expect } from 'chai';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { TreeId } from '../../../src/types/git/tree-id.js';
import { Conflict, MergeFiles, MergePlan, Sides } from '../../../src/types/sdk/merge-plan.js';
import { favouring, resolving } from '../../../src/types/sdk/settlement.js';
import { Regeneration } from '../../../src/types/sdk/repository-state.js';

const rel = (value: string) => RelativeFilePath.fromGit(value);

const NO_FILES: MergeFiles = { added: [], updated: [], merged: [], removed: [], kept: [] };

/**
 * A regeneration whose merge left `conflicts`: a file with markers is written as git merged it,
 * the generator's side of every other one is known, and yours is on disk.
 */
const regeneration = (conflicts: Conflict[]): Regeneration => {
  const sides = new Map<string, Sides<string>>(
    conflicts.map((conflict) => [conflict.path.toString(), { yours: 'blob-of-yours', generated: 'blob-of-generated' }])
  );
  const writes = conflicts
    .filter((conflict) => conflict.kind === 'bothChanged' || conflict.kind === 'bothAdded')
    .map((conflict) => ({ path: conflict.path, blob: 'blob-with-markers' }));
  const plan = new MergePlan(writes, [], conflicts, NO_FILES, sides);
  return { generated: TreeId.fromGit('a'.repeat(40)), merge: { plan, stages: [] } };
};

describe('Settlement', () => {
  it('writes the merge as git made it when the developer resolves, markers and all', () => {
    const original = regeneration([{ path: rel('a.py'), kind: 'bothChanged' }]);

    const settlement = resolving(original);

    expect(settlement.regeneration).to.equal(original);
    expect(settlement.plan).to.equal(original.merge.plan);
    expect(settlement.plan.hasConflicts()).to.be.true;
    expect(settlement.settled).to.be.undefined;
  });

  it('settles the merge the generator’s way, naming every file the merge left in conflict', () => {
    const original = regeneration([
      { path: rel('a.py'), kind: 'bothChanged' },
      { path: rel('b.py'), kind: 'deletedByYou' }
    ]);

    const settlement = favouring('generated', original);

    expect(settlement.regeneration).to.equal(original);
    expect(settlement.plan.hasConflicts()).to.be.false;
    expect(settlement.plan.writes).to.deep.equal([
      { path: rel('a.py'), blob: 'blob-with-markers', settle: 'generated' },
      { path: rel('b.py'), blob: 'blob-of-generated' }
    ]);
    expect(settlement.settled?.side).to.equal('generated');
    expect(settlement.settled?.paths.map(String)).to.deep.equal(['a.py', 'b.py']);
  });

  it('settles the merge your way: markers for you, and a file left whole as it is on disk', () => {
    const original = regeneration([
      { path: rel('a.py'), kind: 'bothChanged' },
      { path: rel('b.py'), kind: 'noLongerGenerated' }
    ]);

    const settlement = favouring('yours', original);

    expect(settlement.regeneration).to.equal(original);
    expect(settlement.plan.hasConflicts()).to.be.false;
    expect(settlement.plan.writes).to.deep.equal([{ path: rel('a.py'), blob: 'blob-with-markers', settle: 'yours' }]);
    expect(settlement.plan.files.merged.map(String)).to.deep.equal(['a.py']);
    expect(settlement.plan.files.kept.map(String)).to.deep.equal(['b.py']);
    expect(settlement.settled?.side).to.equal('yours');
    expect(settlement.settled?.paths.map(String)).to.deep.equal(['a.py', 'b.py']);
  });
});
