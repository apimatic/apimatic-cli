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

  describe('makeExecutable', () => {
    const fileService = new FileService();
    const permissionsOf = (file: FilePath) => fs.statSync(file.toString()).mode & 0o777;
    let root: string;
    let hook: FilePath;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-'));
      hook = new FilePath(new DirectoryPath(root), new FileName('pre-push'));
      fs.writeFileSync(hook.toString(), '#!/bin/sh');
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('keeps the file writable, so a later run can rewrite it', async () => {
      await fileService.makeExecutable(hook);

      expect(() => fs.accessSync(hook.toString(), fs.constants.W_OK)).not.to.throw();
    });

    describe('where the file system keeps execute bits', () => {
      // Windows keeps none: git runs a hook there whatever its mode.
      before(function () {
        if (process.platform === 'win32') this.skip();
      });

      it('lets whoever may read the file run it', async () => {
        fs.chmodSync(hook.toString(), 0o644);

        await fileService.makeExecutable(hook);

        expect(permissionsOf(hook)).to.equal(0o755);
      });

      it('keeps a hook only its owner may read to its owner', async () => {
        fs.chmodSync(hook.toString(), 0o600);

        await fileService.makeExecutable(hook);

        expect(permissionsOf(hook)).to.equal(0o700);
      });
    });
  });

  describe('hasEntriesExcluding', () => {
    const fileService = new FileService();
    let root: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-'));
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('counts every entry but the named ones, hidden ones included, and none for a directory that is not there', async () => {
      const directory = new DirectoryPath(path.join(root, 'sdk'));
      const git = [new FileName('.git')];
      expect(await fileService.hasEntriesExcluding(directory, git)).to.be.false;

      fs.mkdirSync(path.join(root, 'sdk', '.git'), { recursive: true });
      expect(await fileService.hasEntriesExcluding(directory, git)).to.be.false;

      fs.mkdirSync(path.join(root, 'sdk', '.github'));
      expect(await fileService.hasEntriesExcluding(directory, git)).to.be.true;
    });
  });

  describe('writeBytesIfChanged', () => {
    const fileService = new FileService();
    let root: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-'));
    });

    afterEach(() => {
      sinon.restore();
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('writes the bytes, making the directories above, and skips a file that already holds them', async () => {
      const file = new FilePath(new DirectoryPath(path.join(root, 'deep', 'er')), new FileName('a.bin'));
      const bytes = new Uint8Array([0x78, 0x0d, 0x00]);

      expect(await fileService.writeBytesIfChanged(file, bytes)).to.be.true;
      expect(await fileService.writeBytesIfChanged(file, bytes)).to.be.false;
      expect(await fileService.writeBytesIfChanged(file, new Uint8Array([0x78]))).to.be.true;

      expect([...fs.readFileSync(file.toString())]).to.deep.equal([0x78]);
    });
  });

  describe('removeEmptyDirectories', () => {
    const fileService = new FileService();
    let root: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-'));
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('removes the directory and each empty parent below the root, stopping at one that holds something', async () => {
      const within = new DirectoryPath(path.join(root, 'sdk'));
      fs.mkdirSync(path.join(root, 'sdk', 'models', 'old', 'deep'), { recursive: true });
      fs.writeFileSync(path.join(root, 'sdk', 'models', 'keep.ts'), 'k');

      await fileService.removeEmptyDirectories(within.join('models', 'old', 'deep'), within);

      expect(fs.existsSync(path.join(root, 'sdk', 'models', 'old'))).to.be.false;
      expect(fs.existsSync(path.join(root, 'sdk', 'models', 'keep.ts'))).to.be.true;
    });

    it('leaves the root itself, even when it is empty', async () => {
      const within = new DirectoryPath(path.join(root, 'sdk'));
      fs.mkdirSync(path.join(root, 'sdk', 'only'), { recursive: true });

      await fileService.removeEmptyDirectories(within.join('only'), within);

      expect(fs.existsSync(path.join(root, 'sdk'))).to.be.true;
      expect(fs.readdirSync(path.join(root, 'sdk'))).to.deep.equal([]);
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
