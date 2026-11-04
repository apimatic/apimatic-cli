import path from 'node:path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';

describe('RelativeFilePath', () => {
  it('accepts a path as git names it inside a tree', () => {
    expect(RelativeFilePath.fromGit('src/models/book.ts')?.toString()).to.equal('src/models/book.ts');
    expect(RelativeFilePath.fromGit('README.md')?.toString()).to.equal('README.md');
  });

  for (const value of ['', '/src/a.ts', 'src\\a.ts', 'src//a.ts', './a.ts', '../a.ts', 'src/../a.ts', 'C:/a.ts']) {
    it(`refuses ${JSON.stringify(value)}`, () => {
      expect(RelativeFilePath.fromGit(value)).to.be.undefined;
    });
  }

  it('is the file on disk below a directory, spelt the way the OS spells it', () => {
    const sdk = new DirectoryPath(path.join('sdk', 'typescript'));

    const file = RelativeFilePath.fromGit('src/models/book.ts')!.in(sdk);

    expect(file.toString()).to.equal(path.resolve('sdk', 'typescript', 'src', 'models', 'book.ts'));
    expect(file.name().toString()).to.equal('book.ts');
  });
});
