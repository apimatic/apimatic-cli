import { expect } from 'chai';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { GitOperation } from '../../../src/types/git/git-operation.js';
import { RepositoryState } from '../../../src/types/sdk/repository-state.js';
import { rel } from '../../helpers/merge.js';

const BASE = CommitId.fromGit('a'.repeat(40))!;
const none = GitOperation.none();

describe('RepositoryState', () => {
  it('answers nothing for a directory that is not a repository of its own', () => {
    const state = RepositoryState.notARepository();

    expect(state.isRepository()).to.be.false;
    expect(state.operation.isUnderWay()).to.be.false;
    expect(state.hasUnresolved()).to.be.false;
    expect(state.isRecorded()).to.be.false;
    expect(state.mergeBase()).to.be.undefined;
    expect(state.isSnapshotMissing()).to.be.false;
  });

  it('merges against the recorded snapshot only while the repository holds it, and says when it does not', () => {
    const held = RepositoryState.of(none, [], true, BASE, true);
    const missing = RepositoryState.of(none, [], true, BASE, false);
    const otherGeneration = RepositoryState.of(none, [], true, undefined, false);
    const unrecorded = RepositoryState.of(none, [], false, undefined, false);

    expect(held.mergeBase()).to.deep.equal(BASE);
    expect(held.isSnapshotMissing()).to.be.false;
    expect(missing.mergeBase()).to.be.undefined;
    expect(missing.isSnapshotMissing()).to.be.true;
    expect(otherGeneration.mergeBase()).to.be.undefined;
    expect(otherGeneration.isSnapshotMissing()).to.be.false;
    expect([held, missing, otherGeneration].map((state) => state.isRecorded())).to.deep.equal([true, true, true]);
    expect(unrecorded.isRecorded()).to.be.false;
    expect(unrecorded.isRepository()).to.be.true;
  });

  it('carries what is in the way: the operation under way and the paths left unmerged', () => {
    const busy = RepositoryState.of(GitOperation.markedBy('MERGE_HEAD'), [rel('a.py')], false, undefined, false);

    expect(busy.operation.isUnderWay()).to.be.true;
    expect(busy.operation.toString()).to.equal('merge');
    expect(busy.hasUnresolved()).to.be.true;
    expect(busy.unresolved.map(String)).to.deep.equal(['a.py']);
  });
});
