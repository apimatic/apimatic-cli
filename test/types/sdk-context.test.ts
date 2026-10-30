import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { SdkContext } from '../../src/types/sdk-context.js';

describe('SdkContext', () => {
  let root: string;
  let context: SdkContext;

  const inRoot = (...segments: string[]) => path.join(root, ...segments);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-context-'));
    context = new SdkContext(new DirectoryPath(inRoot('sdk', 'python')));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('exists', () => {
    it('is whether the directory holds anything, so a missing or empty one is written without a question', async () => {
      expect(await context.exists()).to.be.false;

      fs.mkdirSync(inRoot('sdk', 'python'), { recursive: true });
      expect(await context.exists()).to.be.false;

      fs.writeFileSync(inRoot('sdk', 'python', 'README.md'), '# mine');
      expect(await context.exists()).to.be.true;
    });
  });

  describe('save', () => {
    it('replaces what the SDK directory holds with the generation, and answers with the directory', async () => {
      fs.mkdirSync(inRoot('generated'));
      fs.writeFileSync(inRoot('generated', 'README.md'), '# sdk');
      fs.mkdirSync(inRoot('sdk', 'python'), { recursive: true });
      fs.writeFileSync(inRoot('sdk', 'python', 'old.py'), 'old');

      const saved = await context.save(new DirectoryPath(inRoot('generated')));

      expect(saved.toString()).to.equal(inRoot('sdk', 'python'));
      expect(fs.readdirSync(inRoot('sdk', 'python'))).to.deep.equal(['README.md']);
    });
  });
});
