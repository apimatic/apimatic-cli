import { expect } from 'chai';
import { GitVersion } from '../../../src/types/git/git-version.js';

describe('GitVersion', () => {
  it('reads what git prints, on any platform', () => {
    expect(GitVersion.parse('git version 2.47.1.windows.1')!.toString()).to.equal('2.47.1');
    expect(GitVersion.parse('git version 2.39.5 (Apple Git-154)')!.toString()).to.equal('2.39.5');
    expect(GitVersion.parse('git version 2.38')!.toString()).to.equal('2.38.0');
    expect(GitVersion.parse('not git')).to.be.undefined;
  });

  it('supports the merge from 2.38 on', () => {
    expect(GitVersion.parse('git version 2.37.9')!.isSupported()).to.be.false;
    expect(GitVersion.parse('git version 2.38.0')!.isSupported()).to.be.true;
    expect(GitVersion.parse('git version 3.0.0')!.isSupported()).to.be.true;
    expect(GitVersion.required()).to.equal('2.38');
  });
});
