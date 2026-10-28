import path from 'node:path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { RelativeDirectoryPath } from '../../../src/types/file/relativeDirectoryPath.js';
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

  it('is seen from above a directory without changing its spelling', () => {
    const file = RelativeFilePath.fromGit('src/models/book.ts')!;
    const sdk = RelativeDirectoryPath.fromGit('sdk/typescript')!;

    expect(file.under(sdk).toString()).to.equal('sdk/typescript/src/models/book.ts');
  });

  it('is seen from inside a directory it is under, and not from one it is not', () => {
    const file = RelativeFilePath.fromGit('sdk/typescript/src/models/book.ts')!;

    expect(file.within(RelativeDirectoryPath.fromGit('sdk/typescript')!)?.toString()).to.equal('src/models/book.ts');
    expect(file.within(RelativeDirectoryPath.fromGit('sdk/types')!)).to.be.undefined;
    expect(file.within(RelativeDirectoryPath.fromGit('docs')!)).to.be.undefined;
  });

  it('compares by value', () => {
    const a = RelativeFilePath.fromGit('a.ts')!;

    expect(a.isEqual(RelativeFilePath.fromGit('a.ts')!)).to.be.true;
    expect(a.isEqual(RelativeFilePath.fromGit('b.ts')!)).to.be.false;
    expect([RelativeFilePath.fromGit('b.ts')!, a].sort((x, y) => x.compare(y)).map(String)).to.deep.equal([
      'a.ts',
      'b.ts'
    ]);
  });

  it('refuses what git would never print, so a parser slip is reported rather than carried', () => {
    expect(RelativeFilePath.fromGit('/absolute')).to.be.undefined;
  });
});
