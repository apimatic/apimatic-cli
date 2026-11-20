import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'chai';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { StubsContext } from '../../src/types/stubs-context.js';

describe('StubsContext', () => {
  let root: string;
  let stubsDirectory: string;
  let context: StubsContext;

  const write = (directory: string, relative: string, contents = '[]') => {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  /** Every file below the stubs directory, by its path from there. */
  const held = () =>
    fs.existsSync(stubsDirectory)
      ? (fs.readdirSync(stubsDirectory, { recursive: true, withFileTypes: true }) as fs.Dirent[])
          .filter((entry) => entry.isFile())
          .map((entry) =>
            path.relative(stubsDirectory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')
          )
          .sort()
      : [];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'stubs-context-'));
    stubsDirectory = path.join(root, 'stubs');
    context = new StubsContext(new DirectoryPath(stubsDirectory));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('exists', () => {
    it('is false for a directory that is not there', async () => {
      const exists = await context.exists();

      expect(exists).to.be.false;
    });

    it('is false for an empty directory', async () => {
      fs.mkdirSync(stubsDirectory);

      const exists = await context.exists();

      expect(exists).to.be.false;
    });

    it('is false for a directory that holds a repository and nothing else, which a new set leaves alone', async () => {
      write(stubsDirectory, '.git/HEAD', 'ref: refs/heads/main');

      const exists = await context.exists();

      expect(exists).to.be.false;
    });

    it('is true for a directory that holds a stub file', async () => {
      write(stubsDirectory, '01-listAccounts.json');

      const exists = await context.exists();

      expect(exists).to.be.true;
    });

    it('is true for a directory that holds only a hidden file, since a new set removes it', async () => {
      write(stubsDirectory, '.gitkeep', '');

      const exists = await context.exists();

      expect(exists).to.be.true;
    });
  });

  describe('replaceWith', () => {
    let stubFiles: string;

    const replace = () => context.replaceWith(new DirectoryPath(stubFiles));

    beforeEach(() => {
      stubFiles = path.join(root, 'download');
      write(stubFiles, '01-listAccounts.json', '[ "new" ]');
      write(stubFiles, 'oauth2.json', '[ "new" ]');
    });

    it('makes the directory when it is not there', async () => {
      await replace();

      expect(held()).to.deep.equal(['01-listAccounts.json', 'oauth2.json']);
    });

    it('writes the new file over one of the same name', async () => {
      write(stubsDirectory, '01-listAccounts.json', '[ "old" ]');

      await replace();

      expect(fs.readFileSync(path.join(stubsDirectory, '01-listAccounts.json'), 'utf8')).to.equal('[ "new" ]');
    });

    it('removes every file and folder of the last set, so none is served beside the new one', async () => {
      write(stubsDirectory, '01-getHealth.json');
      write(stubsDirectory, '02-listAccounts.json');
      write(stubsDirectory, 'notes/README.md', 'kept by hand');
      write(stubsDirectory, '.gitkeep', '');

      await replace();

      expect(held()).to.deep.equal(['01-listAccounts.json', 'oauth2.json']);
    });

    it('keeps the history of a stubs directory that is a repository', async () => {
      write(stubsDirectory, '.git/HEAD', 'ref: refs/heads/main');
      write(stubsDirectory, '01-getHealth.json');

      await replace();

      expect(held()).to.deep.equal(['.git/HEAD', '01-listAccounts.json', 'oauth2.json']);
    });

    it('copies the folders of the download too', async () => {
      write(stubFiles, 'nested/extra.json');

      await replace();

      expect(held()).to.deep.equal(['01-listAccounts.json', 'nested/extra.json', 'oauth2.json']);
    });
  });
});
