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
    expect(state.snapshot.mergeBase()).to.be.undefined;
    expect(state.snapshot.isMissing()).to.be.false;
  });

  it('carries the recorded snapshot: a base while the repository holds it, one to fetch when it does not', () => {
    const held = RepositoryState.of(none, [], true, BASE, true);
    const missing = RepositoryState.of(none, [], true, BASE, false);
    const otherGeneration = RepositoryState.of(none, [], true, undefined, false);
    const unrecorded = RepositoryState.of(none, [], false, undefined, false);

    expect(held.snapshot.mergeBase()).to.deep.equal(BASE);
    expect(held.snapshot.isMissing()).to.be.false;
    expect(missing.snapshot.mergeBase()).to.be.undefined;
    expect(missing.snapshot.isMissing()).to.be.true;
    expect(missing.snapshot.toFetch()).to.deep.equal(BASE);
    expect(otherGeneration.snapshot.mergeBase()).to.be.undefined;
    expect(otherGeneration.snapshot.isMissing()).to.be.false;
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
