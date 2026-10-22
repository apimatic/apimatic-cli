import { expect } from 'chai';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { TreeId } from '../../../src/types/git/tree-id.js';
import { Conflict, MergeFiles, MergePlan } from '../../../src/types/sdk/merge-plan.js';
import { favouringGenerator, resolving } from '../../../src/types/sdk/settlement.js';
import { Regeneration } from '../../../src/types/sdk-repository-context.js';

const rel = (value: string) => RelativeFilePath.fromGit(value);

const NO_FILES: MergeFiles = { added: [], updated: [], merged: [], removed: [], kept: [], unchanged: [] };

/** A regeneration whose merge left `conflicts`, with the generator's side of each known. */
const regeneration = (conflicts: Conflict[]): Regeneration => {
  const generatedSides = new Map(conflicts.map((conflict) => [conflict.path.toString(), 'blob-of-generated']));
  const plan = new MergePlan([], [], conflicts, [], NO_FILES, generatedSides);
  return {
    generated: TreeId.fromGit('a'.repeat(40)),
    merge: { plan, merged: TreeId.fromGit('b'.repeat(40)), stages: [] }
  };
};

describe('Settlement', () => {
  it('writes the merge as git made it when the developer resolves, markers and all', () => {
    const original = regeneration([{ path: rel('a.py'), kind: 'bothChanged' }]);

    const settlement = resolving(original);

    expect(settlement.regeneration).to.equal(original);
    expect(settlement.plan).to.equal(original.merge.plan);
    expect(settlement.plan.hasConflicts()).to.be.true;
    expect(settlement.settledForGenerator).to.be.empty;
  });

  it('writes the merge run the generator’s way, naming the files the first merge left in conflict', () => {
    const original = regeneration([
      { path: rel('a.py'), kind: 'bothChanged' },
      { path: rel('b.py'), kind: 'noLongerGenerated' }
    ]);
    const favoured = regeneration([{ path: rel('b.py'), kind: 'noLongerGenerated' }]);

    const settlement = favouringGenerator(original, favoured);

    expect(settlement.regeneration).to.equal(favoured);
    expect(settlement.plan.hasConflicts()).to.be.false;
    expect(settlement.plan.writes.map((write) => write.path.toString())).to.deep.equal(['b.py']);
    expect(settlement.settledForGenerator.map(String)).to.deep.equal(['a.py', 'b.py']);
  });
});
