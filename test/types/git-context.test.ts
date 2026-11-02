import { Buffer } from 'node:buffer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { err } from 'neverthrow';
import sinon from 'sinon';
import { FileService } from '../../src/infrastructure/file-service.js';
import { GitService } from '../../src/infrastructure/git-service.js';
import { canonical } from '../../src/infrastructure/tmp-extensions.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../src/types/file/relativeFilePath.js';
import { GitContext } from '../../src/types/git-context.js';
import { CommitId } from '../../src/types/git/commit-id.js';
import { GitVersion } from '../../src/types/git/git-version.js';
import { Language, Stability } from '../../src/types/sdk/generate.js';
import { recordContents } from '../../src/types/sdk/generation-record.js';
import { MergePlan } from '../../src/types/sdk/merge-plan.js';
import { describeCommit, snapshotFiles } from '../helpers/snapshots.js';

/** Where the SDK directory's own repository keeps each generation as the server returned it. */
const PRISTINE_REF = 'refs/apimatic/pristine';
const RECORD = path.join('.apimatic', 'generation.json');
/** The ref a merge keeps the directory under before writing, byte for byte. */
const PREVIOUS_REF = 'refs/apimatic/previous';

type Files = Record<string, string | Buffer>;

const BINARY = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]);

// Long enough that a helper added at the end leaves the file mostly itself, as a real model is.
const MODEL_FIELDS = [
  '  /** Unique identifier of the book. */',
  '  id: string;',
  '  /** Title of the book. */',
  '  title: string;',
  '  /** Full name of the author. */',
  '  author: string;',
  '  /** Year of first publication. */',
  '  year?: number;',
  '  /** Stock status. */',
  '  status?: "available" | "sold_out";'
];
const MODEL_V1 = ['export type Book = {', ...MODEL_FIELDS, '  /** Price in USD. */', '  price: number;', '};', ''].join(
  '\n'
);
const MODEL_V2 = [
  'export type Book = {',
  ...MODEL_FIELDS,
  '  /** Retail price in US dollars. */',
  '  price: number;',
  '  isbn?: string;',
  '};',
  ''
].join('\n');
const HELPER = '\nexport function formatPrice(book: Book): string {\n  return `$${book.price.toFixed(2)}`;\n}\n';
const MODEL_V1_WITH_HELPER = MODEL_V1 + HELPER;

const rel = (value: string) => RelativeFilePath.fromGit(value)!;
const counts = (plan: MergePlan) =>
  Object.fromEntries(Object.entries(plan.files).map(([kind, paths]) => [kind, paths.length]));

describe('GitContext', () => {
  let root: string;
  const git = new GitService();

  const inRoot = (...segments: string[]) => path.join(root, ...segments);
  const sdk = () => inRoot('sdk', 'python');
  const context = (directory = sdk()) => new GitContext(new DirectoryPath(directory));
  /** A git that can serve the feature, for the questions that need one. */
  const USABLE = GitVersion.parse('git version 2.38.0');

  const write = (file: string, contents: string | Buffer) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };

  /** A directory of generated files, beside the SDK directory. */
  const generated = (files: Files): DirectoryPath => {
    const directory = fs.mkdtempSync(inRoot('generated-'));
    for (const [relative, contents] of Object.entries(files)) {
      write(path.join(directory, relative), contents);
    }
    return new DirectoryPath(directory);
  };

  const ownRepository = async (directory = sdk()) => {
    fs.mkdirSync(directory, { recursive: true });
    (await git.init(new DirectoryPath(directory)))._unsafeUnwrap();
  };

  /** The generation `files` recorded in the SDK directory's own repository, as a Python stable SDK. */
  const record = async (files: Files, directory = sdk()) =>
    (await context(directory).recordSnapshot(generated(files), Language.PYTHON, Stability.STABLE))._unsafeUnwrap();

  /** The commit the pristine ref names in the repository at `directory`, or none. */
  const pristineAt = async (directory: string) =>
    (await git.resolveRef(new DirectoryPath(directory), PRISTINE_REF))._unsafeUnwrap();

  beforeEach(() => {
    root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'git-context-')));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('hasGitDirectory', () => {
    it('is false without a .git of its own, whether the directory is there yet or not, inside a repository that only encloses it or not', async () => {
      expect(await context().hasGitDirectory()).to.be.false;

      fs.mkdirSync(inRoot('.git'), { recursive: true });
      fs.mkdirSync(sdk(), { recursive: true });
      expect(await context().hasGitDirectory()).to.be.false;
    });

    for (const [how, setUp] of [
      ['a .git folder', () => fs.mkdirSync(inRoot('sdk', 'python', '.git'), { recursive: true })],
      ['a worktree’s .git file', () => write(inRoot('sdk', 'python', '.git'), 'gitdir: ../.git/worktrees/python')]
    ] as const) {
      it(`is true with ${how}`, async () => {
        setUp();

        expect(await context().hasGitDirectory()).to.be.true;
      });
    }
  });

  describe('hasFilesBesidesGit', () => {
    it('counts what a save would remove: not a directory that is not there, or one holding only .git', async () => {
      expect(await context().hasFilesBesidesGit()).to.be.false;

      fs.mkdirSync(inRoot('sdk', 'python', '.git'), { recursive: true });
      expect(await context().hasFilesBesidesGit()).to.be.false;

      fs.mkdirSync(inRoot('sdk', 'python', '.github'));
      expect(await context().hasFilesBesidesGit()).to.be.true;
    });
  });

  describe('isRepository', () => {
    it('is true for the SDK directory’s own repository, also inside one that encloses it, and records there', async () => {
      await ownRepository(root);
      await ownRepository();

      expect((await context().isRepository(USABLE))._unsafeUnwrap()).to.be.true;

      await record({ 'README.md': '# sdk' });
      expect(await pristineAt(sdk())).to.not.be.undefined;
      expect(await pristineAt(root)).to.be.undefined;
    });

    for (const [where, setUp] of [
      ['inside a repository that only encloses it', () => ownRepository(root)],
      ['outside any repository', async () => undefined]
    ] as const) {
      it(`is false for a .git folder git does not recognise, ${where}`, async () => {
        await setUp();
        fs.mkdirSync(inRoot('sdk', 'python', '.git'), { recursive: true });

        expect((await context().isRepository(USABLE))._unsafeUnwrap()).to.be.false;
      });
    }

    it('reports a git that does not answer', async () => {
      await ownRepository();
      sinon.stub(GitService.prototype, 'topLevel').resolves(err('git broke'));

      expect((await context().isRepository(USABLE))._unsafeUnwrapErr()).to.equal('git broke');
    });

    it('is false without a .git of its own, running no git, so a directory that is not there yet is fine', async () => {
      await ownRepository(root);
      const topLevel = sinon.stub(GitService.prototype, 'topLevel');

      expect((await context().isRepository(USABLE))._unsafeUnwrap()).to.be.false;

      expect(topLevel.called).to.be.false;
    });

    for (const [what, version] of [
      ['no git', GitVersion.none()],
      ['a git too old', GitVersion.parse('git version 2.30.2')]
    ] as const) {
      it(`is false for ${what}, running none, even in the directory’s own repository`, async () => {
        await ownRepository();
        const topLevel = sinon.stub(GitService.prototype, 'topLevel');

        expect((await context().isRepository(version))._unsafeUnwrap()).to.be.false;

        expect(topLevel.called).to.be.false;
      });
    }
  });

  describe('generationRecord', () => {
    it('is none without a file, or with one a CLI did not write', async () => {
      expect((await context().generationRecord()).isFound()).to.be.false;

      write(inRoot('sdk', 'python', RECORD), 'not json');
      expect((await context().generationRecord()).isFound()).to.be.false;
    });

    it('is what the last recording wrote: the generation and its snapshot', async () => {
      await ownRepository();
      const commit = await record({ 'README.md': '# sdk' });

      const found = await context().generationRecord();

      expect(found.baseFor(Language.PYTHON, Stability.STABLE)).to.deep.equal(commit);
      expect(found.baseFor(Language.PYTHON, Stability.BETA)).to.be.undefined;
      expect(fs.readFileSync(inRoot('sdk', 'python', RECORD), 'utf-8')).to.equal(
        recordContents(Language.PYTHON, Stability.STABLE, commit)
      );
    });
  });

  describe('hasSnapshot', () => {
    it('is whether the repository holds the commit, and false for none without running git', async () => {
      await ownRepository();
      const commit = await record({ 'README.md': '# sdk' });

      expect((await context().hasSnapshot(commit))._unsafeUnwrap()).to.be.true;
      expect((await context().hasSnapshot(CommitId.fromGit('f'.repeat(40))))._unsafeUnwrap()).to.be.false;

      const hasCommit = sinon.stub(GitService.prototype, 'hasCommit');
      expect((await context().hasSnapshot(undefined))._unsafeUnwrap()).to.be.false;
      expect(hasCommit.called).to.be.false;
    });

    it('reports a git that does not answer', async () => {
      await ownRepository();
      sinon.stub(GitService.prototype, 'hasCommit').resolves(err('git broke'));

      expect((await context().hasSnapshot(CommitId.fromGit('f'.repeat(40))))._unsafeUnwrapErr()).to.equal('git broke');
    });
  });

  describe('save', () => {
    it('replaces what the SDK directory holds with the generation, except its .git', async () => {
      write(inRoot('sdk', 'python', '.git', 'HEAD'), 'ref: refs/heads/main');
      write(inRoot('sdk', 'python', 'old.py'), 'old');
      write(inRoot('sdk', 'python', RECORD), '{}');

      const saved = await context().save(generated({ 'README.md': '# sdk' }));

      expect(saved.toString()).to.equal(sdk());
      expect(fs.readdirSync(sdk()).sort()).to.deep.equal(['.git', 'README.md']);
      expect(fs.readFileSync(inRoot('sdk', 'python', '.git', 'HEAD'), 'utf-8')).to.equal('ref: refs/heads/main');
    });
  });

  describe('recordSnapshot', () => {
    it('records the first snapshot with no parent, under the pristine ref, with every file, named for the generation', async () => {
      await ownRepository();

      const commit = await record({
        'README.md': '# v1',
        'src/index.py': 'x',
        '.gitignore': 'dist/\n',
        'dist/x.py': 'x'
      });

      expect(await pristineAt(sdk())).to.deep.equal(commit);
      expect(await describeCommit(new DirectoryPath(sdk()), commit)).to.deep.equal({
        parents: [],
        authorName: 'APIMatic CLI',
        subject: 'apimatic: pristine python stable'
      });
      const files = await snapshotFiles(new DirectoryPath(sdk()), commit);
      expect([...files.keys()]).to.have.members(['README.md', 'src/index.py', '.gitignore', 'dist/x.py']);
      expect(files.get('src/index.py')).to.equal('x');
      expect((await context().generationRecord()).baseFor(Language.PYTHON, Stability.STABLE)).to.deep.equal(commit);
    });

    it('records an SDK whose path holds a space and a folder starting with a dot, and finds it again', async () => {
      const directory = inRoot('My API', 'sdk', '.python');
      await ownRepository(directory);

      const commit = await record({ 'README.md': '# v1' }, directory);

      expect(await pristineAt(directory)).to.deep.equal(commit);
      expect((await context(directory).isRepository(USABLE))._unsafeUnwrap()).to.be.true;
    });

    it('chains the next snapshot onto the last and moves the ref, the record following', async () => {
      await ownRepository();
      const first = await record({ 'README.md': '# v1' });

      const second = await record({ 'README.md': '# v2' });

      expect((await describeCommit(new DirectoryPath(sdk()), second)).parents).to.deep.equal([first]);
      expect(await pristineAt(sdk())).to.deep.equal(second);
      expect((await snapshotFiles(new DirectoryPath(sdk()), first)).get('README.md')).to.equal('# v1');
      expect((await context().generationRecord()).baseFor(Language.PYTHON, Stability.STABLE)).to.deep.equal(second);
    });

    it('keeps the last snapshot when the generation is identical, and still writes the record', async () => {
      await ownRepository();
      const first = await record({ 'README.md': '# v1' });
      fs.rmSync(inRoot('sdk', 'python', '.apimatic'), { recursive: true });

      const again = await record({ 'README.md': '# v1' });
      const changed = await record({ 'README.md': '# v2' });

      expect(again).to.deep.equal(first);
      expect((await describeCommit(new DirectoryPath(sdk()), changed)).parents).to.deep.equal([first]);
      expect(fs.existsSync(inRoot('sdk', 'python', RECORD))).to.be.true;
    });

    it('leaves the repository’s own index alone', async () => {
      await ownRepository();

      await record({ 'README.md': '# v1' });

      expect((await execa('git', ['ls-files'], { cwd: sdk() })).stdout).to.equal('');
    });

    it('fails, the snapshot committed all the same, when the record cannot be written', async () => {
      await ownRepository();
      sinon.stub(FileService.prototype, 'replaceContents').rejects(new Error('EACCES: permission denied'));

      const recorded = await context().recordSnapshot(
        generated({ 'README.md': '# v1' }),
        Language.PYTHON,
        Stability.STABLE
      );

      expect(recorded._unsafeUnwrapErr()).to.contain('EACCES');
      expect(await pristineAt(sdk())).to.not.be.undefined;
      expect(fs.existsSync(inRoot('sdk', 'python', RECORD))).to.be.false;
    });
  });

  describe('merge and write', () => {
    let counter = 0;

    /**
     * `base` was generated last time, `disk` is the SDK directory now, `fresh` is the generator's new
     * output: the plan, and the directory once the plan is written, unless the test reads the plan alone.
     * `beforeWrite` runs once the plan is made, for a test that breaks the write, which is then not unwrapped.
     */
    const merged = async (
      base: Files,
      disk: Files,
      fresh: Files,
      { written = true, beforeWrite }: { written?: boolean; beforeWrite?: () => void } = {}
    ) => {
      const directory = inRoot(`sdk-${counter++}`);
      await ownRepository(directory);
      const baseCommit = await record(base, directory);
      for (const [relative, contents] of Object.entries(disk)) {
        write(path.join(directory, relative), contents);
      }
      const freshDirectory = generated(fresh);
      const plan = (await context(directory).merge(baseCommit, freshDirectory))._unsafeUnwrap();
      beforeWrite?.();
      const previous = (await context(directory).keepPrevious(baseCommit))._unsafeUnwrap();
      const landed =
        written || beforeWrite !== undefined ? await context(directory).write(plan, freshDirectory) : undefined;
      if (beforeWrite === undefined) {
        landed?._unsafeUnwrap();
      }
      const at = (relative: string) => path.join(directory, relative);
      const list = (dir: string): string[] =>
        fs
          .readdirSync(dir, { withFileTypes: true })
          .flatMap((entry) =>
            entry.isDirectory()
              ? list(path.join(dir, entry.name))
              : [path.relative(directory, path.join(dir, entry.name)).split(path.sep).join('/')]
          );
      return {
        plan,
        previous,
        landed,
        directory,
        read: (relative: string) => (fs.existsSync(at(relative)) ? fs.readFileSync(at(relative), 'utf-8') : undefined),
        bytes: (relative: string) => fs.readFileSync(at(relative)),
        exists: (relative: string) => fs.existsSync(at(relative)),
        paths: () =>
          list(directory)
            .filter((relative) => !relative.startsWith('.git/') && !relative.startsWith('.apimatic/'))
            .sort()
      };
    };

    /** Makes every write of a file named `name` fail, and of `a.ts` too when it is being put back to `1`. */
    const breaking =
      (name: string, andRestoringA = false) =>
      () => {
        const real = FileService.prototype.writeBytes;
        sinon.stub(FileService.prototype, 'writeBytes').callsFake(function (this: FileService, file, content) {
          const target = file.toString();
          const restoringA = andRestoringA && target.endsWith('a.ts') && Buffer.from(content).toString() === '1\r\n';
          return target.endsWith(name) || restoringA
            ? Promise.reject(new Error(`EACCES: permission denied, open '${target}'`))
            : real.call(this, file, content);
        });
      };

    it('merges your edit with the generator’s change when they touch different lines', async () => {
      const { plan, read } = await merged(
        { 'book.ts': MODEL_V1 },
        { 'book.ts': MODEL_V1_WITH_HELPER },
        { 'book.ts': MODEL_V2 }
      );

      expect(read('book.ts')).to.equal(MODEL_V2 + HELPER);
      expect(plan.files.merged.map(String)).to.deep.equal(['book.ts']);
      expect(plan.hasConflicts()).to.be.false;
    });

    it('reports the lines you and the generator both changed as a conflict', async () => {
      const yours = MODEL_V1.replace('Price in USD.', 'Price in USD, VAT included.');

      const { plan, read } = await merged(
        { 'book.ts': MODEL_V1 },
        { 'book.ts': yours },
        { 'book.ts': MODEL_V2 },
        {
          written: false
        }
      );

      expect(plan.conflicts).to.deep.equal([{ path: rel('book.ts'), kind: 'bothChanged' }]);
      expect(read('book.ts')).to.equal(yours);
    });

    it('adds a file the generator produced for the first time, and never touches one that is yours alone, nor its own record', async () => {
      const { plan, read } = await merged(
        { 'a.ts': 'a\n' },
        { 'a.ts': 'a\n', 'custom/format.ts': 'mine\n' },
        { 'a.ts': 'a\n', 'delete-book.ts': 'new\n' }
      );

      expect(read('delete-book.ts')).to.equal('new\n');
      expect(read('custom/format.ts')).to.equal('mine\n');
      expect(plan.writes.map((write) => write.path.toString())).to.deep.equal(['delete-book.ts']);
      expect(plan.files.added.map(String)).to.deep.equal(['delete-book.ts']);
      expect(plan.files.kept.map(String)).to.deep.equal(['custom/format.ts']);
    });

    it('reports a path you and the generator both added with different content as a conflict, and accepts one with the same', async () => {
      const differ = await merged(
        { 'a.ts': 'a\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'yours\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'generated\n' },
        { written: false }
      );
      const same = await merged(
        { 'a.ts': 'a\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'same\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'same\n' }
      );

      expect(differ.plan.conflicts).to.deep.equal([{ path: rel('retry.ts'), kind: 'bothAdded' }]);
      expect(same.plan.writes).to.be.empty;
      expect(same.plan.hasConflicts()).to.be.false;
    });

    it('follows a file you moved and merges the generator’s change into it where it is now', async () => {
      const { plan, read, exists } = await merged(
        { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
        { 'models/catalog/book.ts': MODEL_V1_WITH_HELPER, 'b.ts': 'b\n' },
        { 'models/book.ts': MODEL_V2, 'b.ts': 'b\n' }
      );

      expect(read('models/catalog/book.ts')).to.equal(MODEL_V2 + HELPER);
      expect(exists('models/book.ts')).to.be.false;
      expect(plan.hasConflicts()).to.be.false;
    });

    it('carries your edit to a file the generator renamed, and removes the old name', async () => {
      const { plan, read, exists } = await merged(
        { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
        { 'models/book.ts': MODEL_V1_WITH_HELPER, 'b.ts': 'b\n' },
        { 'models/book-model.ts': MODEL_V2, 'b.ts': 'b\n' }
      );

      expect(read('models/book-model.ts')).to.equal(MODEL_V2 + HELPER);
      expect(exists('models/book.ts')).to.be.false;
      expect(plan.hasConflicts()).to.be.false;
    });

    it('renames a file whose name changed only in case, on a filesystem that ignores case too', async () => {
      const { paths, read } = await merged(
        { 'models/user.ts': 'user\n', 'b.ts': 'b\n' },
        { 'models/user.ts': 'user\n', 'b.ts': 'b\n' },
        { 'models/User.ts': 'user\n', 'b.ts': 'b\n' }
      );

      expect(paths()).to.deep.equal(['b.ts', 'models/User.ts']);
      expect(read('models/User.ts')).to.equal('user\n');
    });

    describe('two spec versions in a row, as a generator ships them', () => {
      const v1: Files = {
        'src/models/book.ts': MODEL_V1,
        'src/sdk/authors.ts': 'export class Authors {}\n',
        'docs/models/book.md': '# Book\n\nprice\n'
      };
      const v2: Files = {
        'src/models/book.ts': MODEL_V2,
        'src/sdk/authors.ts': 'export class Authors {}\n',
        'src/funcs/delete-book.ts': 'export function deleteBook() {}\n',
        'docs/models/book.md': '# Book\n\nprice\nisbn\n'
      };

      it('counts a helper, a new file and a custom file through the v2 spec, and reports a deleted docs page as a conflict', async () => {
        const { plan } = await merged(
          v1,
          {
            'src/models/book.ts': MODEL_V1_WITH_HELPER,
            'src/sdk/authors.ts': 'export class Authors {}\n',
            'src/custom/format.ts': 'mine\n'
          },
          v2,
          { written: false }
        );

        expect(plan.conflicts).to.deep.equal([{ path: rel('docs/models/book.md'), kind: 'deletedByYou' }]);
        expect(counts(plan)).to.deep.equal({ added: 1, updated: 0, merged: 1, removed: 0, kept: 1 });
      });

      it('reports an edited file the v3 spec drops as a conflict, and removes nothing else it did not produce', async () => {
        const v3: Files = { 'src/models/book.ts': MODEL_V2, 'docs/models/book.md': '# Book\n\nprice\nisbn\n' };

        const { plan } = await merged(
          v1,
          {
            'src/models/book.ts': MODEL_V1,
            'src/sdk/authors.ts': 'export class Authors { getMany() {} }\n',
            'docs/models/book.md': '# Book\n\nprice\n'
          },
          v3,
          { written: false }
        );

        expect(plan.conflicts).to.deep.equal([{ path: rel('src/sdk/authors.ts'), kind: 'noLongerGenerated' }]);
        expect(plan.files.updated).to.have.length(2);
        expect(plan.deletes).to.deep.equal([]);
      });
    });

    describe('a write that fails partway', () => {
      const BEFORE: Files = { 'a.ts': '1\r\n', 'b.ts': '1\n', 'c.ts': '1\n' };
      const AFTER: Files = { 'a.ts': '2\n', 'b.ts': '2\n', 'd.ts': 'new\n' };

      it('names the file and stops there, and a restore puts back what it had changed, byte for byte', async () => {
        const { plan, previous, landed, directory, read, paths } = await merged(BEFORE, BEFORE, AFTER, {
          beforeWrite: breaking('b.ts')
        });

        const problem = landed!._unsafeUnwrapErr();
        expect(problem.file.toString()).to.equal('b.ts');
        expect(problem.operation).to.equal('write');
        expect(problem.reason).to.contain('EACCES');
        expect(read('a.ts')).to.equal('2\r\n');
        expect(read('c.ts')).to.be.undefined;

        (await context(directory).restore(previous, plan))._unsafeUnwrap();

        expect(paths()).to.deep.equal(['a.ts', 'b.ts', 'c.ts']);
        expect([read('a.ts'), read('b.ts'), read('c.ts')]).to.deep.equal(['1\r\n', '1\n', '1\n']);
      });

      it('reports what a restore could not put back, the rest put back all the same', async () => {
        const { plan, previous, directory, read } = await merged(BEFORE, BEFORE, AFTER, {
          beforeWrite: breaking('b.ts', true)
        });

        const restored = await context(directory).restore(previous, plan);

        expect(restored._unsafeUnwrapErr()).to.contain('a.ts');
        expect(read('a.ts')).to.equal('2\r\n');
        expect(read('c.ts')).to.equal('1\n');
      });

      it('keeps the directory as it was under the previous ref, byte for byte, before writing', async () => {
        const { directory } = await merged(BEFORE, BEFORE, AFTER);

        const previous = (await git.resolveRef(new DirectoryPath(directory), PREVIOUS_REF))._unsafeUnwrap()!;

        const kept = await snapshotFiles(new DirectoryPath(directory), previous);
        expect(kept.get('a.ts')).to.equal('1\r\n');
        expect([...kept.keys()]).to.have.members(['a.ts', 'b.ts', 'c.ts', '.apimatic/generation.json']);
      });
    });

    describe('how the plan lands on disk', () => {
      it('renames a directory whose name changed only in case', async () => {
        const { paths } = await merged(
          { 'Models/a.ts': 'a\n', 'Models/b.ts': 'b\n', 'c.ts': 'c\n' },
          { 'Models/a.ts': 'a\n', 'Models/b.ts': 'b\n', 'c.ts': 'c\n' },
          { 'models/a.ts': 'a\n', 'models/b.ts': 'b\n', 'c.ts': 'c\n' }
        );

        expect(paths()).to.deep.equal(['c.ts', 'models/a.ts', 'models/b.ts']);
      });

      it('lets a file become a directory and a directory become a file', async () => {
        const { paths, read } = await merged(
          { docs: 'docs\n', 'api/index.md': 'api\n' },
          { docs: 'docs\n', 'api/index.md': 'api\n' },
          { 'docs/index.md': 'docs\n', api: 'api\n' }
        );

        expect(paths()).to.deep.equal(['api', 'docs/index.md']);
        expect(read('docs/index.md')).to.equal('docs\n');
        expect(read('api')).to.equal('api\n');
      });

      it('removes the directories a removed file leaves empty, and no other', async () => {
        const { exists } = await merged(
          { 'models/old/deep/a.ts': 'a\n', 'models/keep.ts': 'k\n' },
          { 'models/old/deep/a.ts': 'a\n', 'models/keep.ts': 'k\n' },
          { 'models/keep.ts': 'k\n' }
        );

        expect(exists('models/old')).to.be.false;
        expect(exists('models/keep.ts')).to.be.true;
      });
    });

    describe('content rules', () => {
      it('reads a line ending alone as no change, writes a merged file with the ending it has on disk, and leaves an untouched CRLF file as it is', async () => {
        const { plan, read } = await merged(
          { 'a.ts': 'one\ntwo\n', 'b.ts': 'b\n' },
          { 'a.ts': 'one\r\ntwo\r\nthree\r\n', 'b.ts': 'b\r\n' },
          { 'a.ts': 'zero\none\ntwo\n', 'b.ts': 'b\n' }
        );

        expect(read('a.ts')).to.equal('zero\r\none\r\ntwo\r\nthree\r\n');
        expect(read('b.ts')).to.equal('b\r\n');
        expect(plan.files.merged).to.have.length(1);
        expect(plan.hasConflicts()).to.be.false;
      });

      it('keeps the generator’s CRLF in a file it changes, gives a new file the generator’s ending, and keeps LF where you chose it', async () => {
        const { read } = await merged(
          { 'a.cs': 'one\r\ntwo\r\n', 'b.cs': 'one\r\ntwo\r\n', 'c.cs': 'c\r\n' },
          { 'a.cs': 'one\r\ntwo\r\n', 'b.cs': 'mine\none\ntwo\n', 'c.cs': 'c\r\n' },
          { 'a.cs': 'one\r\ntwo\r\nthree\r\n', 'b.cs': 'one\r\ntwo\r\nthree\r\n', 'c.cs': 'c\r\n', 'd.cs': 'new\r\n' }
        );

        expect(read('a.cs')).to.equal('one\r\ntwo\r\nthree\r\n');
        expect(read('b.cs')).to.equal('mine\none\ntwo\nthree\n');
        expect(read('d.cs')).to.equal('new\r\n');
      });

      it('replaces an unedited binary and reports an edited one the generator changed too as a conflict', async () => {
        const changed = Buffer.concat([BINARY, Buffer.from([1])]);
        const edited = Buffer.concat([BINARY, Buffer.from([2])]);

        const replaced = await merged({ 'logo.png': BINARY }, { 'logo.png': BINARY }, { 'logo.png': changed });
        const both = await merged(
          { 'logo.png': BINARY },
          { 'logo.png': edited },
          { 'logo.png': changed },
          {
            written: false
          }
        );

        expect(replaced.bytes('logo.png')).to.deep.equal(changed);
        expect(replaced.plan.files.updated).to.have.length(1);
        expect(both.bytes('logo.png')).to.deep.equal(edited);
        expect(both.plan.conflicts).to.deep.equal([{ path: rel('logo.png'), kind: 'binary' }]);
      });
    });
  });
});
