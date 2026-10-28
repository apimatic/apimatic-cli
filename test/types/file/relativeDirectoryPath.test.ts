import { expect } from 'chai';
import { RelativeDirectoryPath } from '../../../src/types/file/relativeDirectoryPath.js';

describe('RelativeDirectoryPath', () => {
  it('accepts a directory as git names it inside a tree', () => {
    expect(RelativeDirectoryPath.fromGit('src/models')?.toString()).to.equal('src/models');
    expect(RelativeDirectoryPath.fromGit('node_modules')?.toString()).to.equal('node_modules');
  });

  for (const value of ['', '/', '/src', 'src\\models', 'src//models', './src', '../src', 'src/..', 'C:/src']) {
    it(`refuses ${JSON.stringify(value)}`, () => {
      expect(RelativeDirectoryPath.fromGit(value)).to.be.undefined;
    });
  }

  it('takes the trailing slash git marks a directory with, and spells the directory without it', () => {
    expect(RelativeDirectoryPath.fromGit('dist/')!.toString()).to.equal('dist');
    expect(RelativeDirectoryPath.fromGit('build/out/')!.toString()).to.equal('build/out');
    expect(RelativeDirectoryPath.fromGit('dist')!.toString()).to.equal('dist');
  });

  it('compares by value', () => {
    const directory = RelativeDirectoryPath.fromGit('dist/')!;

    expect(directory.isEqual(RelativeDirectoryPath.fromGit('dist')!)).to.be.true;
    expect(directory.isEqual(RelativeDirectoryPath.fromGit('build')!)).to.be.false;
  });

  it('refuses what git would never print, so a parser slip is reported rather than carried', () => {
    expect(RelativeDirectoryPath.fromGit('/absolute/')).to.be.undefined;
  });
});
