import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { FileName } from '../../src/types/file/fileName.js';
import { FilePath } from '../../src/types/file/filePath.js';
import { SdkContext } from '../../src/types/sdk-context.js';
import { Language } from '../../src/types/sdk/generate.js';

describe('SdkContext', () => {
  let root: string;
  let context: SdkContext;

  const inRoot = (...segments: string[]) => path.join(root, ...segments);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-context-'));
    context = new SdkContext(Language.PYTHON, new DirectoryPath(inRoot('sdk')));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('save', () => {
    it('zips the SDK into its language directory', async () => {
      fs.mkdirSync(inRoot('generated'));
      fs.writeFileSync(inRoot('generated', 'README.md'), '# sdk');

      const saved = await context.save(new DirectoryPath(inRoot('generated')), true);

      expect(saved._unsafeUnwrap().toString()).to.equal(inRoot('sdk', 'python'));
      expect(fs.existsSync(inRoot('sdk', 'python', 'python.zip'))).to.be.true;
    });

    it('reports an SDK it could not zip, and leaves no archive behind', async () => {
      const saved = await context.save(new DirectoryPath(inRoot('missing')), true);

      expect(saved._unsafeUnwrapErr()).to.contain('ENOENT');
      expect(fs.existsSync(inRoot('sdk', 'python', 'python.zip'))).to.be.false;
    });
  });

  describe('loadSdkInTempDirectory', () => {
    it('reports a download that is not an archive', async () => {
      const download = new FilePath(new DirectoryPath(root), new FileName('sdk.zip'));
      fs.writeFileSync(download.toString(), 'not a zip');

      const loaded = await context.loadSdkInTempDirectory(new DirectoryPath(inRoot('temp')), download);

      expect(loaded._unsafeUnwrapErr()).to.not.be.empty;
    });
  });
});
