import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import { execa } from 'execa';
import { GitService } from '../../src/infrastructure/git-service.js';
import { canonical } from '../../src/infrastructure/tmp-extensions.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { FileName } from '../../src/types/file/fileName.js';
import { FilePath } from '../../src/types/file/filePath.js';
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

  describe('repository', () => {
    const git = new GitService();

    it('finds the repository enclosing the SDK directory, which need not exist yet', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();

      const repository = (await context.repository())._unsafeUnwrap();

      expect(repository?.root().isEqual(new DirectoryPath(canonical(root)))).to.be.true;
      expect(repository?.sdkDirectory().isEqual(new DirectoryPath(canonical(root), 'sdk', 'python'))).to.be.true;
    });

    it('finds none when that repository ignores the SDK directory, until the directory is a repository of its own', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
      fs.writeFileSync(inRoot('.gitignore'), '/sdk/\n');

      expect((await context.repository())._unsafeUnwrap()).to.be.undefined;

      fs.mkdirSync(inRoot('sdk', 'python'), { recursive: true });
      (await git.init(new DirectoryPath(inRoot('sdk', 'python'))))._unsafeUnwrap();
      const own = (await context.repository())._unsafeUnwrap();
      expect(own?.root().isEqual(new DirectoryPath(canonical(root), 'sdk', 'python'))).to.be.true;
    });
  });

  describe('repository, as the SDK directory sits', () => {
    const git = new GitService();

    it('finds nothing outside a repository', async () => {
      fs.mkdirSync(inRoot('sdk', 'python'), { recursive: true });

      expect((await context.repository())._unsafeUnwrap()).to.be.undefined;
    });

    it('answers with the enclosing repository, however deep the SDK directory sits', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
      const deep = new SdkContext(new DirectoryPath(inRoot('packages', 'sdk', 'python')));

      const repository = (await deep.repository())._unsafeUnwrap()!;

      expect(repository.root().isEqual(new DirectoryPath(canonical(root)))).to.be.true;
      expect(repository.pristineRef().toString()).to.equal('refs/apimatic/pristine/packages/sdk/python');
    });
  });

  describe('initRepository', () => {
    it('creates the SDK directory when it is not there yet, as a repository of its own', async () => {
      const repository = (await context.initRepository())._unsafeUnwrap();

      expect(fs.existsSync(inRoot('sdk', 'python', '.git'))).to.be.true;
      expect(repository.root().isEqual(new DirectoryPath(inRoot('sdk', 'python')))).to.be.true;
      expect(repository.pristineRef().toString()).to.equal('refs/apimatic/pristine');
    });

    it('makes the SDK directory its own repository, on main, leaving its files alone', async () => {
      fs.mkdirSync(inRoot('sdk', 'python'), { recursive: true });
      fs.writeFileSync(inRoot('sdk', 'python', 'README.md'), '# sdk');

      (await context.initRepository())._unsafeUnwrap();

      expect(fs.readFileSync(inRoot('sdk', 'python', '.git', 'HEAD'), 'utf-8').trim()).to.equal('ref: refs/heads/main');
      expect(fs.readFileSync(inRoot('sdk', 'python', 'README.md'), 'utf-8')).to.equal('# sdk');
    });
  });

  describe('archive', () => {
    const git = new GitService();
    const entries = (archive: string) => new AdmZip(archive).getEntries().map((entry) => entry.entryName);

    it('zips the files git would commit: not .git, the record, or what the SDK’s .gitignore excludes', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
      fs.mkdirSync(inRoot('sdk', 'python', 'models'), { recursive: true });
      fs.writeFileSync(inRoot('sdk', 'python', 'models', 'book.py'), 'class Book: ...');
      await execa('git', ['add', '.'], { cwd: root });
      fs.writeFileSync(inRoot('sdk', 'python', 'README.md'), '# sdk');
      fs.writeFileSync(inRoot('sdk', 'python', '.gitignore'), 'dist/\n');
      fs.mkdirSync(inRoot('sdk', 'python', 'dist'));
      fs.writeFileSync(inRoot('sdk', 'python', 'dist', 'built.py'), 'built');
      fs.mkdirSync(inRoot('sdk', 'python', '.apimatic'));
      fs.writeFileSync(inRoot('sdk', 'python', '.apimatic', 'generation.json'), '{}');
      fs.mkdirSync(inRoot('temp'));

      const archive = (await context.archive(new DirectoryPath(inRoot('temp'))))._unsafeUnwrap();

      expect(entries(archive.toString())).to.have.members(['.gitignore', 'README.md', 'models/book.py']);
    });

    it('zips every file but .git and the record when the directory is in no repository', async () => {
      fs.mkdirSync(inRoot('sdk', 'python', 'models'), { recursive: true });
      fs.writeFileSync(inRoot('sdk', 'python', 'models', 'book.py'), 'class Book: ...');
      fs.writeFileSync(inRoot('sdk', 'python', 'README.md'), '# sdk');
      fs.mkdirSync(inRoot('sdk', 'python', '.git'));
      fs.writeFileSync(inRoot('sdk', 'python', '.git', 'HEAD'), 'ref: refs/heads/main');
      fs.mkdirSync(inRoot('sdk', 'python', '.apimatic'));
      fs.writeFileSync(inRoot('sdk', 'python', '.apimatic', 'generation.json'), '{}');
      fs.mkdirSync(inRoot('temp'));

      const archive = (await context.archive(new DirectoryPath(inRoot('temp'))))._unsafeUnwrap();

      expect(entries(archive.toString())).to.have.members(['README.md', 'models/book.py']);
    });
  });

  describe('save', () => {
    it('replaces what the SDK directory holds, except its .git', async () => {
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
