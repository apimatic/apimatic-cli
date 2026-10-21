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
    it('replaces what the language directory holds, except its .git', async () => {
      fs.mkdirSync(inRoot('generated'));
      fs.writeFileSync(inRoot('generated', 'README.md'), '# sdk');
      fs.mkdirSync(inRoot('sdk', 'python', '.git'), { recursive: true });
      fs.writeFileSync(inRoot('sdk', 'python', '.git', 'HEAD'), 'ref: refs/heads/main');
      fs.writeFileSync(inRoot('sdk', 'python', 'old.py'), 'old');

      const saved = await context.save(new DirectoryPath(inRoot('generated')));

      expect(saved.toString()).to.equal(inRoot('sdk', 'python'));
      expect(fs.readdirSync(inRoot('sdk', 'python')).sort()).to.deep.equal(['.git', 'README.md']);
      expect(fs.readFileSync(inRoot('sdk', 'python', '.git', 'HEAD'), 'utf-8')).to.equal('ref: refs/heads/main');
    });
  });

  describe('loadSdkInTempDirectory', () => {
    it('reports a download that is not an archive', async () => {
      const download = new FilePath(new DirectoryPath(root), new FileName('sdk.zip'));
      fs.writeFileSync(download.toString(), 'not a zip');

      const loaded = await context.loadSdkInTempDirectory(new DirectoryPath(inRoot('temp')), download);

      const problem = loaded._unsafeUnwrapErr();
      expect(problem.kind).to.equal('unzipFailed');
      expect(problem.reason).to.not.be.empty;
    });
  });
});
