import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
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
