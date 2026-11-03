import { expect } from 'chai';
import { RemoteName } from '../../../src/types/git/remote-name.js';

describe('RemoteName', () => {
  it('takes a name or a URL as git gives it, and refuses an empty one or one with whitespace', () => {
    expect(RemoteName.fromGit('origin')?.toString()).to.equal('origin');
    expect(RemoteName.fromGit('ssh://example.invalid/sdk.git')?.toString()).to.equal('ssh://example.invalid/sdk.git');
    expect(RemoteName.fromGit('')).to.be.undefined;
    expect(RemoteName.fromGit('two words')).to.be.undefined;
    expect(RemoteName.origin().toString()).to.equal('origin');
  });
});
