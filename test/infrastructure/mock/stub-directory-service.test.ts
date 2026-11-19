import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { StubDirectoryService } from '../../../src/infrastructure/mock/stub-directory-service.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { stubFixtures, successStub } from '../../helpers/mock-stubs.js';

describe('StubDirectoryService', () => {
  let root: string;

  const write = (name: string, content: string) => fs.writeFileSync(path.join(root, name), content);
  const load = (directory = root) => new StubDirectoryService().load(new DirectoryPath(directory));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'apimatic-mock-stubs-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  for (const [set, stubs] of [
    ['sample', 20],
    ['spec-s', 84],
    ['tester-poc', 113]
  ] as const) {
    it(`loads the ${stubs} stubs of the ${set} set from its directory`, async () => {
      const loaded = await load(path.join(stubFixtures, set));

      expect(loaded._unsafeUnwrap().all).to.have.lengthOf(stubs);
    });
  }

  it('loads no stubs from an empty directory', async () => {
    const loaded = await load();

    expect(loaded._unsafeUnwrap().all).to.deep.equal([]);
  });

  it('names each stub by its file, in ordinal name order', async () => {
    write('a.json', successStub({ name: 'second' }));
    write('B.json', successStub({ name: 'first' }));

    const loaded = await load();

    expect(loaded._unsafeUnwrap().all.map((stub) => [stub.file, stub.name])).to.deep.equal([
      ['B.json', 'first'],
      ['a.json', 'second']
    ]);
  });

  it('skips a dot file and loads a file whose extension is in upper case', async () => {
    write('._01-op.json', '\u0000\u0005\u0016\u0007');
    write('02-op.JSON', successStub());

    const loaded = await load();

    expect(loaded._unsafeUnwrap().all.map((stub) => stub.file)).to.deep.equal(['02-op.JSON']);
  });

  it('reads the top level alone: not a file in a subfolder, nor a folder named like a stub file', async () => {
    write('a.json', successStub());
    fs.mkdirSync(path.join(root, 'sub'));
    write(path.join('sub', 'e.json'), 'not json');
    fs.mkdirSync(path.join(root, 'folder.json'));

    const loaded = await load();

    expect(loaded._unsafeUnwrap().all.map((stub) => stub.file)).to.deep.equal(['a.json']);
  });

  it('skips a file that is not a stub file', async () => {
    write('a.json', successStub());
    write('README.md', '# stubs');

    const loaded = await load();

    expect(loaded._unsafeUnwrap().all).to.have.lengthOf(1);
  });

  it('reports every problem of every file', async () => {
    write('a.json', successStub());
    write('b.json', successStub());
    write('c.json', '');

    const loaded = await load();

    expect(loaded._unsafeUnwrapErr().map((problem) => `${problem.file} ${problem.path}`.trimEnd())).to.deep.equal([
      'b.json /0/name',
      'c.json'
    ]);
  });

  it('says a directory that is not there does not exist', async () => {
    const missing = path.join(root, 'missing');

    const loaded = await load(missing);

    expect(loaded._unsafeUnwrapErr()).to.deep.equal([
      { file: new DirectoryPath(missing).toString(), path: '', message: 'The stubs directory does not exist.' }
    ]);
  });

  it('reports a directory it may not list as a problem of the directory', async function () {
    // Windows keeps no such permission bit, and root reads any directory.
    if (process.platform === 'win32' || process.getuid?.() === 0) {
      this.skip();
    }
    write('a.json', successStub());
    fs.chmodSync(root, 0o000);

    const loaded = await load().finally(() => fs.chmodSync(root, 0o700));

    expect(loaded._unsafeUnwrapErr().map((problem) => [problem.file, problem.path])).to.deep.equal([
      [new DirectoryPath(root).toString(), '']
    ]);
    expect(loaded._unsafeUnwrapErr()[0].message).to.include('The stubs directory could not be read: ');
  });

  it('says so when it is given a stub file in place of its directory', async () => {
    write('a.json', successStub());

    const loaded = await load(path.join(root, 'a.json'));

    expect(loaded._unsafeUnwrapErr().map((problem) => problem.message)).to.deep.equal([
      'This is a file; the stubs directory is the folder that holds the stub files.'
    ]);
  });
});
