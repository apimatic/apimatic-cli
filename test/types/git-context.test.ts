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
import { GitContext } from '../../src/types/git-context.js';
import { CommitId } from '../../src/types/git/commit-id.js';
import { GitVersion } from '../../src/types/git/git-version.js';
import { Language, Stability } from '../../src/types/sdk/generate.js';
import { recordContents } from '../../src/types/sdk/generation-record.js';
import { GENERATED_MARKER, Side, YOURS_MARKER } from '../../src/types/sdk/conflict-markers.js';
import { counts, kinds } from '../helpers/merge.js';
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
     * `favour` settles the conflicts for that side, as the question's answer does, and the settled plan is the
     * one written and returned. `beforeWrite` runs once the plan is made, for a test that breaks the write,
     * which is then not unwrapped.
     */
    const merged = async (
      base: Files,
      disk: Files,
      fresh: Files,
      { written = true, favour, beforeWrite }: { written?: boolean; favour?: Side; beforeWrite?: () => void } = {}
    ) => {
      const directory = inRoot(`sdk-${counter++}`);
      await ownRepository(directory);
      const baseCommit = await record(base, directory);
      for (const [relative, contents] of Object.entries(disk)) {
        write(path.join(directory, relative), contents);
      }
      const freshDirectory = generated(fresh);
      const made = (await context(directory).merge(baseCommit, freshDirectory))._unsafeUnwrap();
      const plan = favour === undefined ? made : made.taking(favour);
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

    it('marks the lines you and the generator both changed, with the CLI’s labels, and keeps the rest merged', async () => {
      const yours = MODEL_V1.replace('Price in USD.', 'Price in USD, VAT included.');

      const { plan, read } = await merged({ 'book.ts': MODEL_V1 }, { 'book.ts': yours }, { 'book.ts': MODEL_V2 });

      expect(read('book.ts')).to.equal(
        [
          'export type Book = {',
          ...MODEL_FIELDS,
          YOURS_MARKER,
          '  /** Price in USD, VAT included. */',
          '=======',
          '  /** Retail price in US dollars. */',
          GENERATED_MARKER,
          '  price: number;',
          '  isbn?: string;',
          '};',
          ''
        ].join('\n')
      );
      expect(kinds(plan.conflicts)).to.deep.equal([['book.ts', 'bothChanged']]);
      expect(plan.stages.map(({ stage, path: staged }) => [String(staged), stage])).to.deep.equal([
        ['book.ts', 1],
        ['book.ts', 2],
        ['book.ts', 3]
      ]);
    });

    it('leaves the directory alone when the plan is only read', async () => {
      const yours = MODEL_V1.replace('Price in USD.', 'Price in USD, VAT included.');

      const { plan, read } = await merged(
        { 'book.ts': MODEL_V1 },
        { 'book.ts': yours },
        { 'book.ts': MODEL_V2 },
        { written: false }
      );

      expect(plan.hasConflicts()).to.be.true;
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

    it('marks a path you and the generator both added with different content, and accepts one with the same', async () => {
      const differ = await merged(
        { 'a.ts': 'a\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'yours\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'generated\n' }
      );
      const same = await merged(
        { 'a.ts': 'a\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'same\n' },
        { 'a.ts': 'a\n', 'retry.ts': 'same\n' }
      );

      expect(differ.read('retry.ts')).to.equal(
        [YOURS_MARKER, 'yours', '=======', 'generated', GENERATED_MARKER, ''].join('\n')
      );
      expect(kinds(differ.plan.conflicts)).to.deep.equal([['retry.ts', 'bothAdded']]);
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

    it('labels the markers in a file you moved with the sides, where git names the old path too', async () => {
      const { plan, read } = await merged(
        { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
        { 'models/catalog/book.ts': MODEL_V1.replace('Price in USD.', 'Price in USD, VAT included.'), 'b.ts': 'b\n' },
        { 'models/book.ts': MODEL_V2, 'b.ts': 'b\n' }
      );

      const content = read('models/catalog/book.ts')!;
      expect(content).to.contain(`${YOURS_MARKER}\n`).and.to.contain(`${GENERATED_MARKER}\n`);
      expect(content).to.not.match(/^[<>]{7} [0-9a-f]{40}/m);
      expect(kinds(plan.conflicts)).to.deep.equal([['models/catalog/book.ts', 'bothChanged']]);
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

    it('neither lists nor brings back the old name of a file the generator renamed and you deleted', async () => {
      const { plan, paths, read } = await merged(
        { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
        { 'b.ts': 'b\n' },
        { 'models/book-model.ts': MODEL_V2, 'b.ts': 'b\n' }
      );

      expect(kinds(plan.conflicts)).to.deep.equal([['models/book-model.ts', 'deletedByYou']]);
      expect(paths()).to.deep.equal(['b.ts', 'models/book-model.ts']);
      expect(read('models/book-model.ts')).to.equal(MODEL_V2);
    });

    describe('settled for a side, as the question’s answer is', () => {
      it('settles each overlapping hunk for that side and merges the rest, with the file’s own line ending', async () => {
        const base = 'a\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng\r\n';
        const yours = 'A\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng yours\r\n';
        const generated = 'a\nb\nc\nD\ne\nf\ng generated\n';
        const expected = {
          generated: 'A\r\nb\r\nc\r\nD\r\ne\r\nf\r\ng generated\r\n',
          yours: 'A\r\nb\r\nc\r\nD\r\ne\r\nf\r\ng yours\r\n'
        };
        for (const favour of ['generated', 'yours'] as const) {
          const { plan, read } = await merged({ 'a.ts': base }, { 'a.ts': yours }, { 'a.ts': generated }, { favour });

          expect(read('a.ts'), favour).to.equal(expected[favour]);
          expect(plan.hasConflicts(), favour).to.be.false;
          expect(plan.files.merged.map(String), favour).to.deep.equal(['a.ts']);
        }
      });

      it('keeps an edited file the generator stopped producing, for the generator’s side too', async () => {
        const { plan, read } = await merged(
          { 'models/book.ts': MODEL_V1, 'helper.ts': 'helper\n' },
          { 'models/book.ts': MODEL_V1_WITH_HELPER, 'helper.ts': 'helper, edited\n' },
          { 'models/book.ts': MODEL_V2 },
          { favour: 'generated' }
        );

        expect(read('helper.ts')).to.equal('helper, edited\n');
        expect(read('models/book.ts')).to.equal(MODEL_V2 + HELPER);
        expect(plan.files.kept.map(String)).to.deep.equal(['helper.ts']);
        expect(plan.hasConflicts()).to.be.false;
      });

      it('keeps a file you added inside a directory the generator renamed, for either side', async () => {
        for (const favour of ['generated', 'yours'] as const) {
          const { plan, paths, read } = await merged(
            { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
            { 'models/book.ts': MODEL_V1, 'models/custom.ts': 'custom\n', 'b.ts': 'b\n' },
            { 'model/book.ts': MODEL_V2, 'b.ts': 'b\n' },
            { favour }
          );

          expect(paths(), favour).to.deep.equal(['b.ts', 'model/book.ts', 'model/custom.ts']);
          expect(read('model/custom.ts')).to.equal('custom\n');
          expect(read('model/book.ts')).to.equal(MODEL_V2);
          expect(plan.hasConflicts(), favour).to.be.false;
        }
      });

      it('reports a file you added inside a directory the generator renamed as a conflict of another shape, placed in the new directory', async () => {
        const { plan, paths, read } = await merged(
          { 'models/book.ts': MODEL_V1, 'b.ts': 'b\n' },
          { 'models/book.ts': MODEL_V1, 'models/custom.ts': 'custom\n', 'b.ts': 'b\n' },
          { 'model/book.ts': MODEL_V2, 'b.ts': 'b\n' }
        );

        expect(kinds(plan.conflicts)).to.deep.equal([['model/custom.ts', 'other']]);
        expect(paths()).to.deep.equal(['b.ts', 'model/book.ts', 'model/custom.ts']);
        expect(read('model/custom.ts')).to.equal('custom\n');
        expect(counts(plan.files)).to.deep.equal({ added: 0, updated: 1, merged: 0, removed: 1, kept: 0 });
      });
    });

    describe('stageConflicts', () => {
      it('marks the conflicted paths in the repository’s own index at stages 1, 2 and 3, and nothing else', async () => {
        const yours = MODEL_V1.replace('Price in USD.', 'Price in USD, VAT included.');
        const { plan, directory } = await merged(
          { 'book.ts': MODEL_V1, 'b.ts': 'b\n' },
          { 'book.ts': yours, 'b.ts': 'b\n' },
          { 'book.ts': MODEL_V2, 'b.ts': 'b\n' }
        );

        (await context(directory).stageConflicts(plan))._unsafeUnwrap();

        const { stdout } = await execa('git', ['ls-files', '--stage'], { cwd: directory });
        expect(stdout.split('\n').map((line) => [line.split('\t')[1], line.split(/\s+/)[2]])).to.deep.equal([
          ['book.ts', '1'],
          ['book.ts', '2'],
          ['book.ts', '3']
        ]);
      });
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

      it('keeps a helper, a new file and a custom file through the v2 spec, and writes back a deleted docs page as a conflict', async () => {
        const { plan, read, paths } = await merged(
          v1,
          {
            'src/models/book.ts': MODEL_V1_WITH_HELPER,
            'src/sdk/authors.ts': 'export class Authors {}\n',
            'src/custom/format.ts': 'mine\n'
          },
          v2
        );

        expect(paths()).to.deep.equal([
          'docs/models/book.md',
          'src/custom/format.ts',
          'src/funcs/delete-book.ts',
          'src/models/book.ts',
          'src/sdk/authors.ts'
        ]);
        expect(read('src/models/book.ts')).to.equal(MODEL_V2 + HELPER);
        expect(kinds(plan.conflicts)).to.deep.equal([['docs/models/book.md', 'deletedByYou']]);
        expect(counts(plan.files)).to.deep.equal({ added: 1, updated: 0, merged: 1, removed: 0, kept: 1 });
      });

      it('keeps an edited file the v3 spec drops, and removes nothing else it did not produce', async () => {
        const v3: Files = { 'src/models/book.ts': MODEL_V2, 'docs/models/book.md': '# Book\n\nprice\nisbn\n' };

        const { plan, read, exists } = await merged(
          v1,
          {
            'src/models/book.ts': MODEL_V1,
            'src/sdk/authors.ts': 'export class Authors { getMany() {} }\n',
            'docs/models/book.md': '# Book\n\nprice\n'
          },
          v3
        );

        expect(exists('src/sdk/authors.ts')).to.be.true;
        expect(read('src/models/book.ts')).to.equal(MODEL_V2);
        expect(kinds(plan.conflicts)).to.deep.equal([['src/sdk/authors.ts', 'noLongerGenerated']]);
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

      it('labels the markers of a CRLF file on CRLF lines', async () => {
        const { read } = await merged(
          { 'a.cs': 'one\r\ntwo\r\n' },
          { 'a.cs': 'one\r\nmine\r\n' },
          { 'a.cs': 'one\r\ntheirs\r\n' }
        );

        expect(read('a.cs')).to.equal(`one\r\n${YOURS_MARKER}\r\nmine\r\n=======\r\ntheirs\r\n${GENERATED_MARKER}\r\n`);
      });

      it('replaces an unedited binary and keeps an edited one, as a conflict when the generator changed it too', async () => {
        const changed = Buffer.concat([BINARY, Buffer.from([1])]);
        const edited = Buffer.concat([BINARY, Buffer.from([2])]);

        const replaced = await merged({ 'logo.png': BINARY }, { 'logo.png': BINARY }, { 'logo.png': changed });
        const both = await merged({ 'logo.png': BINARY }, { 'logo.png': edited }, { 'logo.png': changed });
        const settled = await merged(
          { 'logo.png': BINARY },
          { 'logo.png': edited },
          { 'logo.png': changed },
          { favour: 'generated' }
        );

        expect(replaced.bytes('logo.png')).to.deep.equal(changed);
        expect(replaced.plan.files.updated).to.have.length(1);
        expect(both.bytes('logo.png')).to.deep.equal(edited);
        expect(kinds(both.plan.conflicts)).to.deep.equal([['logo.png', 'binary']]);
        expect(settled.bytes('logo.png')).to.deep.equal(changed);
        expect(settled.plan.files.updated.map(String)).to.deep.equal(['logo.png']);
        expect(settled.plan.hasConflicts()).to.be.false;
      });
    });
  });
});
