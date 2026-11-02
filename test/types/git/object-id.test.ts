import { expect } from 'chai';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { TreeId } from '../../../src/types/git/tree-id.js';

describe('CommitId and TreeId', () => {
  it('take what git prints, 40 hex digits or 64 in a SHA-256 repository, and nothing else', () => {
    expect(CommitId.fromGit('a'.repeat(40))?.toString()).to.equal('a'.repeat(40));
    expect(TreeId.fromGit('b'.repeat(64))?.toString()).to.equal('b'.repeat(64));
    expect(CommitId.fromGit('HEAD')).to.be.undefined;
    expect(TreeId.fromGit('A'.repeat(40))).to.be.undefined;
  });

  it('compare two trees by id', () => {
    expect(TreeId.fromGit('a'.repeat(40))!.isEqual(TreeId.fromGit('a'.repeat(40))!)).to.be.true;
    expect(TreeId.fromGit('a'.repeat(40))!.isEqual(TreeId.fromGit('b'.repeat(40))!)).to.be.false;
  });
});
