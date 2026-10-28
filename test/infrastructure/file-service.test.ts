import fs from 'fs';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import sinon from 'sinon';
import { expect } from 'chai';
import { FileService } from '../../src/infrastructure/file-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';

describe('FileService', () => {
  describe('replaceContents', () => {
    const fileService = new FileService();
    let root: string;
    let target: FilePath;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-'));
      target = new FilePath(new DirectoryPath(root), new FileName('config.json'));
    });

    afterEach(() => {
      sinon.restore();
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('replaces what the file held and leaves nothing beside it', async () => {
      fs.writeFileSync(target.toString(), 'old');

      await fileService.replaceContents(target, 'new');

      expect(fs.readFileSync(target.toString(), 'utf-8')).to.equal('new');
      expect(fs.readdirSync(root)).to.deep.equal(['config.json']);
    });

    it('creates the file, and the directory above it, when neither is there', async () => {
      const nested = new FilePath(new DirectoryPath(root).join('nested'), new FileName('config.json'));

      await fileService.replaceContents(nested, 'new');

      expect(fs.readFileSync(nested.toString(), 'utf-8')).to.equal('new');
    });

    it('leaves the target as it was, and no temporary file, when the rename fails', async () => {
      fs.writeFileSync(target.toString(), 'old');
      sinon.stub(fsExtra, 'rename').rejects(new Error('EPERM: operation not permitted'));

      let thrown: unknown;
      try {
        await fileService.replaceContents(target, 'new');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).to.be.an('error');
      expect(fs.readFileSync(target.toString(), 'utf-8')).to.equal('old');
      expect(fs.readdirSync(root)).to.deep.equal(['config.json']);
    });
  });

  describe('replaceContentsIfChanged', () => {
    const fileService = new FileService();
    let root: string;
    let target: FilePath;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-'));
      target = new FilePath(new DirectoryPath(root), new FileName('theme.css'));
    });

    afterEach(() => {
      sinon.restore();
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('replaces a file that holds something else, and says so', async () => {
      fs.writeFileSync(target.toString(), 'old');
      const replace = sinon.spy(FileService.prototype, 'replaceContents');

      expect(await fileService.replaceContentsIfChanged(target, 'new')).to.be.true;

      expect(fs.readFileSync(target.toString(), 'utf-8')).to.equal('new');
      expect(replace.calledOnce).to.be.true;
    });

    it('creates a file that is not there, and says so', async () => {
      expect(await fileService.replaceContentsIfChanged(target, 'new')).to.be.true;

      expect(fs.readFileSync(target.toString(), 'utf-8')).to.equal('new');
    });

    // An empty file is still a file: only a missing one is written for empty contents.
    it('leaves a file holding the same contents untouched, and says so', async () => {
      fs.writeFileSync(target.toString(), '');
      const replace = sinon.spy(FileService.prototype, 'replaceContents');

      expect(await fileService.replaceContentsIfChanged(target, '')).to.be.false;

      expect(replace.called).to.be.false;
    });
  });

  describe('spelledOnDisk', () => {
    const fileService = new FileService();
    let root: DirectoryPath;
    const fileAt = (...names: string[]) => {
      const fileName = new FileName(names.pop() ?? '');
      return new FilePath(root.join(...names), fileName);
    };

    beforeEach(() => {
      root = new DirectoryPath(fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-')));
      fs.mkdirSync(path.join(root.toString(), 'static', 'images'), { recursive: true });
      fs.writeFileSync(path.join(root.toString(), 'static', 'images', 'logo.png'), '');
    });

    afterEach(() => {
      sinon.restore();
      fs.rmSync(root.toString(), { recursive: true, force: true });
    });

    it('answers with the file itself when it is spelt as on disk', async () => {
      const file = fileAt('static', 'images', 'logo.png');

      const found = await fileService.spelledOnDisk(root, file);

      expect(found?.isEqual(file)).to.be.true;
    });

    it('answers with the spelling on disk of a file and the directories above it named in another case', async () => {
      const found = await fileService.spelledOnDisk(root, fileAt('Static', 'Images', 'Logo.PNG'));

      expect(found?.isEqual(fileAt('static', 'images', 'logo.png'))).to.be.true;
    });

    it('answers null for a file that is not there in any case', async () => {
      expect(await fileService.spelledOnDisk(root, fileAt('static', 'images', 'icon.png'))).to.be.null;
      expect(await fileService.spelledOnDisk(root, fileAt('static', 'logos', 'logo.png'))).to.be.null;
    });

    it('does not take a directory for the file', async () => {
      expect(await fileService.spelledOnDisk(root, fileAt('static', 'images'))).to.be.null;
    });

    it('answers with the spelling on disk of a directory, itself included, or null when it is not there', async () => {
      const images = root.join('static', 'images');

      expect((await fileService.directorySpelledOnDisk(root, root.join('Static', 'Images')))?.isEqual(images)).to.be
        .true;
      expect((await fileService.directorySpelledOnDisk(root, images))?.isEqual(images)).to.be.true;
      expect((await fileService.directorySpelledOnDisk(root, root))?.isEqual(root)).to.be.true;
      expect(await fileService.directorySpelledOnDisk(root, root.join('static', 'logos'))).to.be.null;
    });

    it('answers null for a directory that is not below the root', async () => {
      expect(await fileService.directorySpelledOnDisk(root.join('static'), root)).to.be.null;
    });

    it('answers for several files, reading each folder once', async () => {
      fs.writeFileSync(path.join(root.toString(), 'static', 'images', 'icon.png'), '');
      const readdir = sinon.spy(fsExtra, 'readdir');

      const found = await fileService.spellingsOnDisk(root, [
        fileAt('static', 'images', 'Logo.png'),
        fileAt('static', 'images', 'icon.png'),
        fileAt('static', 'images', 'banner.png')
      ]);

      expect(found.map((file) => file?.relativeTo(root) ?? null)).to.deep.equal([
        'static/images/logo.png',
        'static/images/icon.png',
        null
      ]);
      expect(readdir.callCount).to.equal(3);
    });
  });

  describe('findSymlinks', () => {
    const fileService = new FileService();
    let root: DirectoryPath;
    const symlink = (target: string, ...at: string[]) =>
      fs.symlinkSync(
        root.join(target).toString(),
        root.join(...at).toString(),
        process.platform === 'win32' ? 'junction' : 'dir'
      );

    beforeEach(() => {
      root = new DirectoryPath(fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-')));
      fs.mkdirSync(root.join('spec', 'schemas').toString(), { recursive: true });
      fs.writeFileSync(path.join(root.toString(), 'spec', 'openapi.yaml'), '');
    });

    afterEach(() => {
      fs.rmSync(root.toString(), { recursive: true, force: true });
    });

    it('answers every symlink at any depth, without following one', async () => {
      fs.mkdirSync(root.join('shared').toString());
      symlink('shared', 'shared', 'back');
      symlink('shared', 'spec', 'common');
      symlink('shared', 'spec', 'schemas', 'shared');

      const found = (await fileService.findSymlinks(root.join('spec')))._unsafeUnwrap();

      expect(found.map((file) => file.toString())).to.have.members([
        root.join('spec', 'common').toString(),
        root.join('spec', 'schemas', 'shared').toString()
      ]);
    });

    it('answers an empty list when there is none', async () => {
      expect((await fileService.findSymlinks(root.join('spec')))._unsafeUnwrap()).to.deep.equal([]);
    });

    it('answers why, rather than throwing, when the directory cannot be read', async () => {
      const missing = await fileService.findSymlinks(root.join('missing'));

      expect(missing._unsafeUnwrapErr()).to.contain('ENOENT');
    });
  });

  describe('copyDirectoryContentsFollowingLinks', () => {
    const fileService = new FileService();
    let root: DirectoryPath;
    const inRoot = (...parts: string[]) => path.join(root.toString(), ...parts);
    // Copied one level deeper than the source, so a relative link kept as a link would point at nothing.
    const copy = () => root.join('elsewhere', 'copy');
    const folderLink = process.platform === 'win32' ? 'junction' : 'dir';

    beforeEach(() => {
      root = new DirectoryPath(fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-')));
      fsExtra.outputFileSync(inRoot('shared', 'notes.md'), '# notes');
      fs.mkdirSync(inRoot('source'));
    });

    afterEach(() => {
      fs.rmSync(root.toString(), { recursive: true, force: true });
    });

    it('copies a linked folder as the folder it points to', async () => {
      fs.symlinkSync(inRoot('shared'), inRoot('source', 'linked'), folderLink);

      await fileService.copyDirectoryContentsFollowingLinks(root.join('source'), copy());

      expect(fs.lstatSync(copy().join('linked').toString()).isSymbolicLink()).to.be.false;
      expect(fs.readFileSync(path.join(copy().toString(), 'linked', 'notes.md'), 'utf-8')).to.equal('# notes');
    });

    it('copies a relative file link as the file it points to', async function () {
      try {
        fs.symlinkSync(path.join('..', 'shared', 'notes.md'), inRoot('source', 'notes.md'), 'file');
      } catch {
        this.skip(); // Windows makes a file link only in Developer Mode or for an administrator.
      }

      await fileService.copyDirectoryContentsFollowingLinks(root.join('source'), copy());

      expect(fs.readFileSync(path.join(copy().toString(), 'notes.md'), 'utf-8')).to.equal('# notes');
    });

    it('fails on a link to nothing only once every other entry is copied', async () => {
      for (let file = 0; file < 400; file++) {
        fsExtra.outputFileSync(inRoot('source', 'content', `${file}.md`), '');
      }
      fs.symlinkSync(inRoot('missing'), inRoot('source', 'broken'), folderLink);

      let thrown: unknown;
      try {
        await fileService.copyDirectoryContentsFollowingLinks(root.join('source'), copy());
      } catch (error) {
        thrown = error;
      }

      expect(thrown).to.be.an('error');
      expect(fs.readdirSync(path.join(copy().toString(), 'content'))).to.have.length(400);
    });

    it('leaves out a top-level entry it is told to, in any case, and keeps a nested one of that name', async () => {
      for (const file of ['Static/logo.png', 'content/static/page.md', 'spec/openapi.json']) {
        fsExtra.outputFileSync(inRoot('source', file), '');
      }

      await fileService.copyDirectoryContentsFollowingLinks(root.join('source'), copy(), [new FileName('static')]);

      const copied = fs.readdirSync(copy().toString(), { recursive: true, encoding: 'utf-8' });
      expect(copied.map((entry) => entry.split(path.sep).join('/'))).to.have.members([
        'content',
        'content/static',
        'content/static/page.md',
        'spec',
        'spec/openapi.json'
      ]);
    });
  });
});
