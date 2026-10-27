import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import sinon from 'sinon';
import { ZipService } from '../../src/infrastructure/zip-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { FileName } from '../../src/types/file/fileName.js';
import { FilePath } from '../../src/types/file/filePath.js';

describe('ZipService', () => {
  let root: string;
  let source: DirectoryPath;
  let archive: FilePath;

  const write = (relative: string, contents: string) => {
    const target = path.join(source.toString(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-service-'));
    source = new DirectoryPath(path.join(root, 'source'));
    fs.mkdirSync(source.toString());
    archive = new FilePath(new DirectoryPath(root), new FileName('archive.zip'));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('archive', () => {
    it('names every entry with forward slashes, whatever the platform separator', async () => {
      write('openapi.json', '{}');
      write(path.join('paths', 'pets.json'), '[]');

      expect((await new ZipService().archive(source, archive)).isOk()).to.be.true;

      const entries = new AdmZip(archive.toString()).getEntries().map((entry) => entry.entryName);
      expect(entries).to.have.members(['openapi.json', 'paths/pets.json']);
    });

    it('reports a source directory that is not there', async () => {
      const archived = await new ZipService().archive(source.join('missing'), archive);

      expect(archived._unsafeUnwrapErr()).to.contain('ENOENT');
      expect(fs.existsSync(archive.toString())).to.be.false;
    });

    it('reports a file it cannot read, and leaves no partial archive behind', async () => {
      write('openapi.json', '{}');
      fs.symlinkSync(path.join(root, 'missing'), path.join(source.toString(), 'dangling'), 'junction');

      const archived = await new ZipService().archive(source, archive);

      expect(archived._unsafeUnwrapErr()).to.contain('ENOENT');
      expect(fs.existsSync(archive.toString())).to.be.false;
    });

    it('reports a directory it cannot list, with nothing it had already listed failing after', async () => {
      fs.symlinkSync(path.join(root, 'missing'), path.join(source.toString(), 'a-dangling'), 'junction');
      fs.mkdirSync(path.join(source.toString(), 'b-unlistable'));
      const list = fs.readdirSync;
      const listInOrder = (directory: fs.PathLike) => {
        if (String(directory).endsWith('b-unlistable')) {
          throw new Error('EACCES: permission denied, scandir');
        }
        return list(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      };
      sinon.stub(fs, 'readdirSync').callsFake(listInOrder as unknown as typeof fs.readdirSync);

      const archived = await new ZipService().archive(source, archive);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(archived._unsafeUnwrapErr()).to.contain('EACCES');
      expect(fs.existsSync(archive.toString())).to.be.false;
    });
  });

  describe('unArchive', () => {
    it('expands what archive packed', async () => {
      write('openapi.json', '{}');
      write(path.join('paths', 'pets.json'), '[]');
      (await new ZipService().archive(source, archive))._unsafeUnwrap();
      const destination = new DirectoryPath(path.join(root, 'destination'));

      expect((await new ZipService().unArchive(archive, destination)).isOk()).to.be.true;

      expect(fs.readFileSync(path.join(destination.toString(), 'openapi.json'), 'utf-8')).to.equal('{}');
      expect(fs.readFileSync(path.join(destination.toString(), 'paths', 'pets.json'), 'utf-8')).to.equal('[]');
    });

    it('reports a file that is not an archive', async () => {
      fs.writeFileSync(archive.toString(), 'not a zip');

      const unpacked = await new ZipService().unArchive(archive, new DirectoryPath(path.join(root, 'destination')));

      expect(unpacked._unsafeUnwrapErr()).to.not.be.empty;
    });
  });
});
