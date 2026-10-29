import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import { execa } from 'execa';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { FileName } from '../../src/types/file/fileName.js';
import { FilePath } from '../../src/types/file/filePath.js';
import { Found, SdkContext } from '../../src/types/sdk-context.js';
import { SdkRepositoryContext } from '../../src/types/sdk-repository-context.js';
import { CodeGenerationVersion, Language, Stability } from '../../src/types/sdk/generate.js';
import { SdkGeneration } from '../../src/types/sdk/sdk-generation.js';
import { SnapshotRef } from '../../src/types/sdk/snapshot-ref.js';

const PYTHON = SdkGeneration.create({
  language: Language.PYTHON,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
})!;

describe('SdkContext', () => {
  let root: string;
  let context: SdkContext;

  const inRoot = (...segments: string[]) => path.join(root, ...segments);

  /** The repository a destination writes through, which the test expects it to have found. */
  const repositoryIn = (destination: Found): SdkRepositoryContext => {
    if (!('repository' in destination)) {
      expect.fail(`no repository behind a ${destination.kind} destination`);
    }
    return destination.repository;
  };

  /** Records one generation through `repository`, so the test can see which repository and path it landed in. */
  const recordOne = async (repository: SdkRepositoryContext) => {
    const generated = fs.mkdtempSync(path.join(root, 'generated-'));
    fs.writeFileSync(path.join(generated, 'README.md'), '# sdk');
    (await repository.recordFresh(new DirectoryPath(generated), PYTHON))._unsafeUnwrap();
  };

  /** The pristine commit in the repository at `repositoryRoot`, or none. */
  const pristineAt = async (repositoryRoot: string) =>
    (await new GitService().resolveRef(new DirectoryPath(repositoryRoot), SnapshotRef.pristine()))._unsafeUnwrap();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-context-'));
    context = new SdkContext(new DirectoryPath(inRoot('sdk', 'python')));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('destination, by the SDK directory’s own repository', () => {
    const git = new GitService();

    it('writes through the SDK directory when it is a repository of its own', async () => {
      fs.mkdirSync(inRoot('sdk', 'python'), { recursive: true });
      (await git.init(new DirectoryPath(inRoot('sdk', 'python'))))._unsafeUnwrap();

      const repository = repositoryIn((await context.destination(PYTHON))._unsafeUnwrap());

      await recordOne(repository);
      expect(await pristineAt(inRoot('sdk', 'python'))).to.not.be.undefined;
    });

    it('finds none in a repository that only encloses it, whether the directory is there yet or not', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
      const deep = new SdkContext(new DirectoryPath(inRoot('packages', 'sdk', 'python')));

      expect((await context.destination(PYTHON))._unsafeUnwrap().kind).to.equal('noRepository');
      expect((await deep.destination(PYTHON))._unsafeUnwrap().kind).to.equal('noRepository');
      fs.mkdirSync(inRoot('sdk', 'python'), { recursive: true });
      expect((await context.destination(PYTHON))._unsafeUnwrap().kind).to.equal('noRepository');
    });

    it('finds the SDK directory’s own repository inside one that encloses it, and records there', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
      fs.mkdirSync(inRoot('sdk', 'python'), { recursive: true });
      (await git.init(new DirectoryPath(inRoot('sdk', 'python'))))._unsafeUnwrap();

      const own = repositoryIn((await context.destination(PYTHON))._unsafeUnwrap());

      await recordOne(own);
      expect(await pristineAt(inRoot('sdk', 'python'))).to.not.be.undefined;
      expect(await pristineAt(root)).to.be.undefined;
    });

    it('finds no repository outside one', async () => {
      fs.mkdirSync(inRoot('sdk', 'python'), { recursive: true });

      expect((await context.destination(PYTHON))._unsafeUnwrap().kind).to.equal('noRepository');
    });
  });

  describe('exists', () => {
    it('counts what a save would remove: not a directory that is not there, or holds only .git', async () => {
      expect(await context.exists()).to.be.false;

      fs.mkdirSync(inRoot('sdk', 'python', '.git'), { recursive: true });
      expect(await context.exists()).to.be.false;

      fs.mkdirSync(inRoot('sdk', 'python', '.github'));
      expect(await context.exists()).to.be.true;
    });
  });

  describe('initRepository', () => {
    it('creates the SDK directory when it is not there yet, as a repository of its own', async () => {
      const repository = (await context.initRepository())._unsafeUnwrap();

      expect(fs.existsSync(inRoot('sdk', 'python', '.git'))).to.be.true;
      await recordOne(repository);
      expect(await pristineAt(inRoot('sdk', 'python'))).to.not.be.undefined;
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
      fs.mkdirSync(inRoot('sdk', 'python', 'models'), { recursive: true });
      (await git.init(new DirectoryPath(inRoot('sdk', 'python'))))._unsafeUnwrap();
      fs.writeFileSync(inRoot('sdk', 'python', 'models', 'book.py'), 'class Book: ...');
      await execa('git', ['add', '.'], { cwd: inRoot('sdk', 'python') });
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
