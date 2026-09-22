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
});
