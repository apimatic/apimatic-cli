import { expect } from 'chai';
import { compareUrl, conflictBranches } from '../../../src/types/sdk/pull-request-link.js';

describe('conflictBranches', () => {
  it('names the two branches after the moment, under apimatic/', () => {
    const branches = conflictBranches(new Date('2026-10-23T14:05:09.123Z'));

    expect(branches).to.deep.equal({
      yours: 'apimatic/conflict/20261023T140509',
      generated: 'apimatic/generated/20261023T140509'
    });
  });
});

describe('compareUrl', () => {
  const branches = { yours: 'apimatic/conflict/1', generated: 'apimatic/generated/1' };
  const expected = 'https://github.com/acme/sdk/compare/apimatic/conflict/1...apimatic/generated/1?expand=1';

  for (const remote of [
    'https://github.com/acme/sdk.git',
    'https://github.com/acme/sdk',
    'https://github.com/acme/sdk/',
    'https://user@github.com/acme/sdk.git',
    'git@github.com:acme/sdk.git',
    'ssh://git@github.com/acme/sdk.git',
    'HTTPS://GitHub.com/acme/sdk.git\n'
  ]) {
    it(`opens GitHub's compare page for ${remote.trim()}`, () => {
      expect(compareUrl(remote, branches)).to.equal(expected);
    });
  }

  for (const remote of ['https://gitlab.com/acme/sdk.git', 'D:/remotes/sdk.git', 'git@bitbucket.org:acme/sdk.git']) {
    it(`has no page for ${remote}`, () => {
      expect(compareUrl(remote, branches)).to.be.undefined;
    });
  }
});
