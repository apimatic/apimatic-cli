import path from 'node:path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
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

  it('is the directory on disk below a root, spelt the way the OS spells it', () => {
    const sdk = new DirectoryPath(path.join('sdk', 'typescript'));

    const directory = RelativeDirectoryPath.fromGit('node_modules/.bin/')!.in(sdk);

    expect(directory.toString()).to.equal(path.resolve('sdk', 'typescript', 'node_modules', '.bin'));
  });
});
