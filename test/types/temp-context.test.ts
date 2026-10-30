import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { ZipService } from '../../src/infrastructure/zip-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { FileName } from '../../src/types/file/fileName.js';
import { FilePath } from '../../src/types/file/filePath.js';
import { TempContext } from '../../src/types/temp-context.js';

describe('TempContext', () => {
  let root: string;

  const inRoot = (...segments: string[]) => path.join(root, ...segments);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'temp-context-'));
    fs.mkdirSync(inRoot('temp'));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('unzip', () => {
    it('expands an archive into a directory of its own below the temp directory', async () => {
      fs.mkdirSync(inRoot('generated'));
      fs.writeFileSync(inRoot('generated', 'README.md'), '# sdk');
      const archive = new FilePath(new DirectoryPath(inRoot('temp')), new FileName('sdk.zip'));
      (await new ZipService().archive(new DirectoryPath(inRoot('generated')), archive))._unsafeUnwrap();

      const unzipped = (await new TempContext(new DirectoryPath(inRoot('temp'))).unzip(archive))._unsafeUnwrap();

      expect(new DirectoryPath(inRoot('temp')).isAncestorOf(unzipped)).to.be.true;
      expect(fs.readFileSync(path.join(unzipped.toString(), 'README.md'), 'utf8')).to.equal('# sdk');
    });

    it('reports a download that is not an archive', async () => {
      const download = new FilePath(new DirectoryPath(root), new FileName('sdk.zip'));
      fs.writeFileSync(download.toString(), 'not a zip');

      const unzipped = await new TempContext(new DirectoryPath(inRoot('temp'))).unzip(download);

      const problem = unzipped._unsafeUnwrapErr();
      expect(problem.kind).to.equal('unzipFailed');
      expect(problem.reason).to.not.be.empty;
    });
  });
});
