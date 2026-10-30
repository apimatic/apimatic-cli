import { expect } from 'chai';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { reconcile } from '../../../src/actions/sdk/generate.js';

describe('reconcile', () => {
  const local = CommitId.fromGit('a'.repeat(40))!;
  const remote = CommitId.fromGit('b'.repeat(40))!;

  it('adopts the remote chain when there is none here, or when it continues the local one', () => {
    expect(
      reconcile({ local: undefined, remote, localContinuesToRemote: false, remoteBehindLocal: false })
    ).to.deep.equal({ kind: 'adopt' });
    expect(reconcile({ local, remote, localContinuesToRemote: true, remoteBehindLocal: false })).to.deep.equal({
      kind: 'adopt'
    });
  });

  it('keeps the local chain when the remote one is behind it', () => {
    expect(reconcile({ local, remote, localContinuesToRemote: false, remoteBehindLocal: true })).to.deep.equal({
      kind: 'keep'
    });
  });

  it('joins two chains that diverged, naming both tips for the two-parent commit', () => {
    expect(reconcile({ local, remote, localContinuesToRemote: false, remoteBehindLocal: false })).to.deep.equal({
      kind: 'join',
      local,
      remote
    });
  });
});
