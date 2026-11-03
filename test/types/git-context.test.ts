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
import { RecordedSnapshot } from '../../src/types/sdk/recorded-snapshot.js';
import { SHARE_HOOK_CALL } from '../../src/types/sdk/share-hook.js';
import { GENERATED_MARKER, Side, YOURS_MARKER } from '../../src/types/sdk/conflict-markers.js';
import { emptyGlobalGitConfig, withHome } from '../helpers/git-environment.js';
import { counts, kinds, leftUnmerged, rel } from '../helpers/merge.js';
import { describeCommit, fetchKind, hookKind, snapshotFiles } from '../helpers/snapshots.js';

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

  describe('inspect', () => {
    const MARKERS = '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n';
    const inspect = async () => (await context().inspect(USABLE, Language.PYTHON, Stability.STABLE))._unsafeUnwrap();

    it('answers nothing for a directory that is not a repository of its own, running no git past the root', async () => {
      const operationInProgress = sinon.stub(GitService.prototype, 'operationInProgress');

      const state = await inspect();

      expect(state.isRepository()).to.be.false;
      expect(state.operation.isUnderWay()).to.be.false;
      expect(state.hasUnresolved()).to.be.false;
      expect(state.isRecorded()).to.be.false;
      expect(state.snapshot.mergeBase()).to.be.undefined;
      expect(operationInProgress.called).to.be.false;
    });

    it('names the operation the repository is in the middle of', async () => {
      await ownRepository();
      fs.writeFileSync(inRoot('sdk', 'python', '.git', 'REBASE_HEAD'), `${'a'.repeat(40)}\n`);

      const state = await inspect();

      expect(state.isRepository()).to.be.true;
      expect(state.operation.isUnderWay()).to.be.true;
      expect(state.operation.toString()).to.equal('rebase');
    });

    it('names the files git holds as unmerged, each once and whatever they hold, and none once every one is staged', async () => {
      await ownRepository();
      const root = new DirectoryPath(sdk());
      write(inRoot('sdk', 'python', 'src', 'a.ts'), 'one\n' + MARKERS);
      write(inRoot('sdk', 'python', 'src', 'b.ts'), 'resolved but not staged\n');
      await leftUnmerged(root, 'src/a.ts');
      await leftUnmerged(root, 'src/b.ts');
      await leftUnmerged(root, 'src/gone.ts');

      expect((await inspect()).unresolved.map(String)).to.deep.equal(['src/a.ts', 'src/b.ts', 'src/gone.ts']);

      await execa('git', ['add', '--', 'src/a.ts', 'src/b.ts'], { cwd: sdk() });
      await execa('git', ['update-index', '--force-remove', '--', 'src/gone.ts'], { cwd: sdk() });
      expect((await inspect()).hasUnresolved()).to.be.false;
    });

    it('finds the snapshot recorded for this generation while the repository holds it, and says when it does not', async () => {
      await ownRepository();
      const commit = await record({ 'README.md': '# sdk' });

      const recorded = await inspect();
      const other = (await context().inspect(USABLE, Language.PYTHON, Stability.BETA))._unsafeUnwrap();
      write(
        inRoot('sdk', 'python', RECORD),
        recordContents(Language.PYTHON, Stability.STABLE, CommitId.fromGit('f'.repeat(40))!)
      );
      const missing = await inspect();

      expect(recorded.isRecorded()).to.be.true;
      expect(recorded.snapshot.mergeBase()).to.deep.equal(commit);
      expect(recorded.snapshot.isMissing()).to.be.false;
      expect(other.isRecorded()).to.be.true;
      expect(other.snapshot.mergeBase()).to.be.undefined;
      expect(other.snapshot.isMissing()).to.be.false;
      expect(missing.snapshot.mergeBase()).to.be.undefined;
      expect(missing.snapshot.isMissing()).to.be.true;
    });

    it('reports a git that does not answer, whichever question it was', async () => {
      await ownRepository();
      await record({ 'README.md': '# sdk' });
      const breaking = [
        () => sinon.stub(GitService.prototype, 'operationInProgress').resolves(err('git broke')),
        () => sinon.stub(GitService.prototype, 'unmergedStages').resolves(err('git broke')),
        () => sinon.stub(GitService.prototype, 'hasCommit').resolves(err('git broke'))
      ];
      for (const breaks of breaking) {
        const broken = breaks();

        expect((await context().inspect(USABLE, Language.PYTHON, Stability.STABLE))._unsafeUnwrapErr()).to.equal(
          'git broke'
        );

        broken.restore();
      }
    });
  });

  describe('fetchSnapshot', () => {
    const sh = (cwd: string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd });
    const REFSPEC = `${PRISTINE_REF}:${PRISTINE_REF}`;

    /** A bare repository the SDK directory's own repository pushes to as `origin`. */
    const withOrigin = async () => {
      const origin = inRoot('origin.git');
      await sh(root, 'init', '-q', '--bare', '--initial-branch=main', origin);
      await ownRepository();
      await sh(sdk(), 'remote', 'add', 'origin', origin);
      return origin;
    };

    /** The generation `files` recorded, committed on `main` and pushed, as a developer leaves a project for a teammate; the pristine ref stays behind. */
    const published = async (files: Files) => {
      const base = await record(files);
      await sh(sdk(), 'add', '.');
      await sh(sdk(), 'commit', '-qm', 'sdk');
      await sh(sdk(), 'push', '-q', 'origin', 'main');
      return base;
    };

    const cloneOf = async (origin: string, name: string) => {
      const clone = inRoot(name);
      await sh(root, 'clone', '-q', '--no-local', origin, clone);
      return clone;
    };

    /** The snapshot the record at `directory` names, as `inspect` finds it and the fetch leaves it. */
    const fetched = async (directory: string) => {
      const state = (await context(directory).inspect(USABLE, Language.PYTHON, Stability.STABLE))._unsafeUnwrap();
      return (await context(directory).fetchSnapshot(state.snapshot))._unsafeUnwrap();
    };

    it('lets a clone merge against a snapshot it fetched, once the origin has it', async () => {
      const origin = await withOrigin();
      const base = await published({ 'README.md': '# v1' });
      const clone = await cloneOf(origin, 'clone');

      const before = await fetched(clone);
      await sh(sdk(), 'push', '-q', 'origin', REFSPEC);
      const after = await fetched(clone);

      expect(before.isMissing()).to.be.true;
      expect(fetchKind(before.fetch)).to.equal('absent origin');
      expect(after.mergeBase()).to.deep.equal(base);
      expect(await pristineAt(clone)).to.deep.equal(base);
    });

    it('moves its ref forward to a chain the remote continued, without a join', async () => {
      const origin = await withOrigin();
      const first = await published({ 'README.md': '# v1' });
      await sh(sdk(), 'push', '-q', 'origin', REFSPEC);
      const clone = await cloneOf(origin, 'clone');
      expect((await fetched(clone)).mergeBase()).to.deep.equal(first);
      const second = await record({ 'README.md': '# v2' });
      await sh(sdk(), 'push', '-q', 'origin', REFSPEC);
      write(path.join(clone, RECORD), recordContents(Language.PYTHON, Stability.STABLE, second));

      const snapshot = await fetched(clone);

      expect(snapshot.mergeBase()).to.deep.equal(second);
      expect(await pristineAt(clone)).to.deep.equal(second);
      expect((await describeCommit(new DirectoryPath(clone), second)).parents).to.deep.equal([first]);
    });

    it('keeps its own chain when the remote’s is behind it', async () => {
      await withOrigin();
      await published({ 'README.md': '# v1' });
      await sh(sdk(), 'push', '-q', 'origin', REFSPEC);
      const second = await record({ 'README.md': '# v2' });
      write(
        inRoot('sdk', 'python', RECORD),
        recordContents(Language.PYTHON, Stability.STABLE, CommitId.fromGit('f'.repeat(40))!)
      );

      const snapshot = await fetched(sdk());

      expect(snapshot.isMissing()).to.be.true;
      expect(fetchKind(snapshot.fetch)).to.equal('absent origin');
      expect(await pristineAt(sdk())).to.deep.equal(second);
    });

    it('joins its own chain with the remote’s when the two diverged, keeping both', async () => {
      const origin = await withOrigin();
      const theirs = await published({ 'README.md': '# theirs' });
      await sh(sdk(), 'push', '-q', 'origin', REFSPEC);
      const other = inRoot('other');
      await ownRepository(other);
      await sh(other, 'remote', 'add', 'origin', origin);
      const mine = await record({ 'README.md': '# mine' }, other);
      write(path.join(other, RECORD), recordContents(Language.PYTHON, Stability.STABLE, theirs));

      const snapshot = await fetched(other);

      expect(snapshot.mergeBase()).to.deep.equal(theirs);
      const tip = (await pristineAt(other))!;
      const joined = await describeCommit(new DirectoryPath(other), tip);
      expect(joined.parents).to.deep.equal([mine, theirs]);
      expect(joined.subject).to.equal('apimatic: pristine chains joined');
      expect((await snapshotFiles(new DirectoryPath(other), tip)).get('README.md')).to.equal('# mine');
    });

    it('reports a remote it cannot reach, and no remote at all', async () => {
      const origin = await withOrigin();
      await published({ 'README.md': '# v1' });
      const clone = await cloneOf(origin, 'clone');
      fs.rmSync(origin, { recursive: true, force: true });

      const unreachable = await fetched(clone);
      await sh(clone, 'remote', 'remove', 'origin');
      const none = await fetched(clone);

      expect(unreachable.isMissing()).to.be.true;
      expect(fetchKind(unreachable.fetch)).to.match(/^failed origin: .+/);
      expect(none.isMissing()).to.be.true;
      expect(fetchKind(none.fetch)).to.equal('none');
    });

    it('runs no git for a snapshot the repository holds, or when nothing is recorded for the generation', async () => {
      await ownRepository();
      const commit = await record({ 'README.md': '# v1' });
      const remoteOf = sinon.stub(GitService.prototype, 'remoteOf');

      const held = await fetched(sdk());
      const none = (await context().fetchSnapshot(RecordedSnapshot.none()))._unsafeUnwrap();

      expect(held.mergeBase()).to.deep.equal(commit);
      expect(none.mergeBase()).to.be.undefined;
      expect(remoteOf.called).to.be.false;
    });

    it('reports a git here that does not answer, before the remote is asked and after', async () => {
      const origin = await withOrigin();
      const base = await published({ 'README.md': '# v1' });
      await sh(sdk(), 'push', '-q', 'origin', REFSPEC);
      const clone = await cloneOf(origin, 'clone');
      const breaking = [
        () => sinon.stub(GitService.prototype, 'remoteOf').resolves(err('git broke')),
        () => sinon.stub(GitService.prototype, 'updateRef').resolves(err('git broke')),
        () => sinon.stub(GitService.prototype, 'hasCommit').resolves(err('git broke'))
      ];
      for (const breaks of breaking) {
        const broken = breaks();

        expect((await context(clone).fetchSnapshot(RecordedSnapshot.of(base, false)))._unsafeUnwrapErr()).to.equal(
          'git broke'
        );

        broken.restore();
      }
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

    it('writes attributes beside the record that merge it as binary and mark it generated', async () => {
      await ownRepository();

      await record({ 'README.md': '# v1' });

      expect(fs.readFileSync(inRoot('sdk', 'python', '.apimatic', '.gitattributes'), 'utf-8')).to.equal(
        '# Written by the APIMatic CLI.\ngeneration.json merge=binary linguist-generated=true\n'
      );
      const checked = await execa(
        'git',
        ['check-attr', 'merge', 'linguist-generated', '--', '.apimatic/generation.json'],
        { cwd: sdk() }
      );
      expect(checked.stdout.split('\n')).to.deep.equal([
        '.apimatic/generation.json: merge: binary',
        '.apimatic/generation.json: linguist-generated: true'
      ]);
    });

    it('leaves the record yours, whole and without markers, when a pull meets a teammate’s record', async () => {
      const sh = (cwd: string, ...args: string[]) =>
        execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...args], {
          cwd,
          reject: false
        });
      /** A generation of `files` recorded in the repository at `directory` and committed; the record as written. */
      const regenerate = async (directory: string, files: Files, message: string) => {
        await record(files, directory);
        await sh(directory, 'add', '-A');
        await sh(directory, 'commit', '-qm', message);
        return fs.readFileSync(path.join(directory, RECORD), 'utf8');
      };
      await ownRepository();
      const origin = inRoot('origin.git');
      const teammate = inRoot('teammate');
      await regenerate(sdk(), { 'README.md': '# v1' }, 'v1');
      await sh(root, 'init', '-q', '--bare', '--initial-branch=main', origin);
      await sh(sdk(), 'remote', 'add', 'origin', origin);
      await sh(sdk(), 'push', '-q', 'origin', 'main');
      await sh(root, 'clone', '-q', origin, teammate);
      await regenerate(teammate, { 'README.md': '# v2 for them' }, 'theirs');
      await sh(teammate, 'push', '-q', 'origin', 'main');
      const yours = await regenerate(sdk(), { 'README.md': '# v2 for me' }, 'mine');

      const pulled = await sh(sdk(), '-c', 'pull.rebase=false', 'pull', '-q', 'origin', 'main');

      const recordNow = fs.readFileSync(inRoot('sdk', 'python', RECORD), 'utf8');
      expect(pulled.exitCode).to.not.equal(0);
      expect(recordNow).to.equal(yours);
      expect(recordNow).to.not.contain('<<<<<<<');
      expect((await sh(sdk(), 'status', '--porcelain', '--', '.apimatic')).stdout).to.equal(
        'UU .apimatic/generation.json'
      );
      await sh(sdk(), 'add', '--', '.apimatic/generation.json');
      expect((await sh(sdk(), 'commit', '-q', '--no-edit')).exitCode).to.equal(0);
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

  describe('shareOnPush', () => {
    const sh = (cwd: string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd });
    const hookFile = (directory: string, name = 'pre-push') => path.join(directory, '.git', 'hooks', name);
    const executable = (file: string) => process.platform === 'win32' || (fs.statSync(file).mode & 0o111) !== 0;
    let restoreConfig: () => void;

    beforeEach(() => {
      restoreConfig = emptyGlobalGitConfig(root);
    });

    afterEach(() => {
      restoreConfig();
    });

    /** The generation `files` recorded in the repository at `directory`, and the hook that shares it as the run leaves it. */
    const shared = async (files: Files = { 'README.md': '# v1' }, directory = sdk()) => {
      await record(files, directory);
      return context(directory).shareOnPush();
    };

    /** An SDK repository at `name` with `origin` (made bare when it is not there yet), one recorded snapshot, the hook installed, and `main` committed. */
    const ready = async (name = 'sdk', origin = inRoot(`${name}-origin.git`)) => {
      if (!fs.existsSync(origin)) {
        await sh(root, 'init', '-q', '--bare', '--initial-branch=main', origin);
      }
      const directory = inRoot(name);
      await ownRepository(directory);
      await sh(directory, 'remote', 'add', 'origin', origin);
      await shared({ 'README.md': `# ${name}` }, directory);
      const commit = (await pristineAt(directory))!;
      write(path.join(directory, 'README.md'), `# ${name}`);
      await sh(directory, 'add', '.');
      await sh(directory, 'commit', '-qm', 'sdk');
      return { directory, origin, commit };
    };

    /** A husky layout at `directory`: git runs `.husky/_/pre-push`, which sources the developer's `.husky/pre-push`. */
    const husky = async (directory: string, hook: string) => {
      await sh(directory, 'config', 'core.hooksPath', '.husky/_');
      write(path.join(directory, '.husky', '_', 'pre-push'), '#!/bin/sh\n. "$(dirname "$0")/../pre-push"\n');
      fs.chmodSync(path.join(directory, '.husky', '_', 'pre-push'), 0o755);
      write(path.join(directory, '.husky', 'pre-push'), hook);
    };

    it('writes the script and a hook that calls it into .git/hooks, once', async () => {
      await ownRepository();

      const first = await shared();
      const second = await shared({ 'README.md': '# v2' });

      expect(hookKind(first)).to.equal(`written ${hookFile(sdk())}`);
      expect(hookKind(second)).to.equal('calling');
      const script = fs.readFileSync(hookFile(sdk(), 'apimatic-pre-push'), 'utf8');
      expect(script.startsWith('#!/bin/sh\n')).to.be.true;
      expect(script).to.contain(PRISTINE_REF);
      expect(script).to.not.contain('\r');
      expect(fs.readFileSync(hookFile(sdk()), 'utf8').split(SHARE_HOOK_CALL)).to.have.length(2);
      expect(executable(hookFile(sdk()))).to.be.true;
      expect(executable(hookFile(sdk(), 'apimatic-pre-push'))).to.be.true;
    });

    it('names the one line to add where git runs hooks from elsewhere, husky’s layout included, keeping the script', async () => {
      await ownRepository();
      await sh(sdk(), 'config', 'core.hooksPath', '.githooks');

      const plain = await shared();

      expect(hookKind(plain)).to.equal(
        `elsewhere ${inRoot('sdk', 'python', '.githooks', 'pre-push')} from ${inRoot('sdk', 'python', '.githooks')} ` +
          `script ${hookFile(sdk(), 'apimatic-pre-push')} committed`
      );
      expect(fs.existsSync(hookFile(sdk(), 'apimatic-pre-push'))).to.be.true;
      expect(fs.existsSync(hookFile(sdk()))).to.be.false;
      expect(fs.existsSync(inRoot('sdk', 'python', '.githooks'))).to.be.false;

      await sh(sdk(), 'config', 'core.hooksPath', '.husky/_');

      expect(hookKind(await shared())).to.contain(`elsewhere ${inRoot('sdk', 'python', '.husky', 'pre-push')} from`);
    });

    it('names the developer’s own hook file for a hooks path under the home directory, with no commit step, until that file names the script', async () => {
      await ownRepository();
      const home = inRoot('home');
      await sh(sdk(), 'config', 'core.hooksPath', '~/.githooks');
      const restoreHome = withHome(home);
      try {
        const needed = await shared();

        expect(hookKind(needed)).to.equal(
          `elsewhere ${path.join(home, '.githooks', 'pre-push')} from ${path.join(home, '.githooks')} ` +
            `script ${hookFile(sdk(), 'apimatic-pre-push')} uncommitted`
        );
        expect(fs.existsSync(inRoot('sdk', 'python', '~'))).to.be.false;

        write(path.join(home, '.githooks', 'pre-push'), `#!/bin/sh\n${SHARE_HOOK_CALL}\n`);

        expect(hookKind(await shared())).to.equal('calling');
      } finally {
        restoreHome();
      }
    });

    it('is quiet once the hook elsewhere runs the script', async () => {
      await ownRepository();
      await sh(sdk(), 'config', 'core.hooksPath', '.husky/_');
      write(inRoot('sdk', 'python', '.husky', 'pre-push'), `npm test\n${SHARE_HOOK_CALL}\n`);

      expect(hookKind(await shared())).to.equal('calling');
    });

    it('leaves a hook in another language alone, naming it, unless it runs the script already', async () => {
      await ownRepository();
      write(hookFile(sdk()), '#!/usr/bin/env node\nconsole.log("hi");\n');

      const left = await shared();

      expect(hookKind(left)).to.equal(`notShell ${hookFile(sdk())} script ${hookFile(sdk(), 'apimatic-pre-push')}`);
      expect(fs.readFileSync(hookFile(sdk()), 'utf8')).to.not.contain(SHARE_HOOK_CALL);

      write(
        hookFile(sdk()),
        '#!/usr/bin/env node\nrequire("child_process").execSync("sh .git/hooks/apimatic-pre-push");\n'
      );

      expect(hookKind(await shared())).to.equal('calling');
    });

    it('shares the chain when the developer pushes a branch, and is quiet about it', async () => {
      const { directory, origin, commit } = await ready();

      const pushed = await sh(directory, 'push', '-q', 'origin', 'main');

      expect(pushed.stderr).to.not.contain('apimatic');
      expect(await pristineAt(origin)).to.deep.equal(commit);
    });

    it('leaves a push that carries the ref itself alone, so pushing it by hand still works', async () => {
      const { directory, origin, commit } = await ready();

      const pushed = await sh(directory, 'push', '-q', 'origin', `${PRISTINE_REF}:${PRISTINE_REF}`);

      expect(pushed.stderr).to.not.contain('apimatic');
      expect(await pristineAt(origin)).to.deep.equal(commit);
    });

    it('shares through husky’s hook too, once it has the line', async () => {
      const { directory, origin, commit } = await ready();
      fs.rmSync(hookFile(directory));
      await husky(directory, `set -e\n${SHARE_HOOK_CALL}\necho "husky ran" >&2\n`);

      const pushed = await sh(directory, 'push', '-q', 'origin', 'main');

      expect(pushed.stderr).to.contain('husky ran');
      expect(pushed.stderr).to.not.contain('apimatic');
      expect(await pristineAt(origin)).to.deep.equal(commit);
    });

    it('does not fail a push from a clone that never ran the CLI', async () => {
      const { origin } = await ready();
      const clone = inRoot('clone');
      await sh(root, 'clone', '-q', '--no-local', origin, clone);
      await husky(clone, `set -e\n${SHARE_HOOK_CALL}\n`);
      write(path.join(clone, 'more.txt'), 'more');
      await sh(clone, 'add', '.');
      await sh(clone, 'commit', '-qm', 'more');

      const pushed = await sh(clone, 'push', '-q', 'origin', 'HEAD:refs/heads/more');

      expect(pushed.exitCode).to.equal(0);
      expect(pushed.stderr).to.not.contain('apimatic');
    });

    it('joins a chain another machine pushed meanwhile, at push time', async () => {
      const a = await ready('a');
      await sh(a.directory, 'push', '-q', 'origin', 'main');
      const b = await ready('b', a.origin);

      const pushed = await sh(b.directory, 'push', '-q', 'origin', 'HEAD:refs/heads/b');

      expect(pushed.stderr).to.not.contain('apimatic');
      const joined = await describeCommit(new DirectoryPath(a.origin), (await pristineAt(a.origin))!);
      expect(joined.subject).to.equal('apimatic: pristine chains joined');
      expect(joined.parents.map(String)).to.have.members([b.commit.toString(), a.commit.toString()]);
    });

    it('warns in the server’s words when the remote refuses the ref, and the branch still lands', async () => {
      const { directory, origin } = await ready();
      write(
        path.join(origin, 'hooks', 'pre-receive'),
        '#!/bin/sh\nwhile read old new ref; do case "$ref" in refs/apimatic/*) echo "snapshots are not accepted here"; exit 1;; esac; done; exit 0\n'
      );
      fs.chmodSync(path.join(origin, 'hooks', 'pre-receive'), 0o755);

      const pushed = await sh(directory, 'push', '-q', 'origin', 'main');

      expect(pushed.stderr).to.contain(
        'apimatic: the SDK snapshots could not be pushed to origin: snapshots are not accepted here'
      );
      expect(await pristineAt(origin)).to.be.undefined;
      expect((await sh(origin, 'rev-parse', '--verify', 'refs/heads/main')).exitCode).to.equal(0);
    });

    it('runs ahead of a hook that was already there, which still runs', async () => {
      const { directory, origin } = await ready();
      write(hookFile(directory), '#!/bin/sh\necho "existing hook ran" >&2\nexit 0\n');
      await shared({ 'README.md': '# v2' }, directory);
      const tip = (await pristineAt(directory))!;

      const pushed = await sh(directory, 'push', '-q', 'origin', 'main');

      expect(pushed.stderr.match(/existing hook ran/g)).to.have.length(1);
      expect(await pristineAt(origin)).to.deep.equal(tip);
    });

    it('reports a git here that does not answer, and a hook that cannot be written, as the hook’s own outcome', async () => {
      await ownRepository();
      const hooksDirectory = sinon.stub(GitService.prototype, 'hooksDirectory').resolves(err('git broke'));

      expect(hookKind(await shared())).to.equal('notWritten: git broke');

      hooksDirectory.restore();
      sinon.stub(FileService.prototype, 'makeExecutable').rejects(new Error('EACCES: permission denied'));

      expect(hookKind(await shared())).to.equal('notWritten: EACCES: permission denied');
      expect(fs.existsSync(hookFile(sdk()))).to.be.false;
    });
  });

  describe('settlementFor', () => {
    const MARKERS = '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n';
    const ASKED = ['marked.ts', 'by-hand.ts', 'dropped.ts', 'deleted-by-you.ts', 'logo.png', 'gone.ts'].map(rel);
    const inSdk = (relative: string) => inRoot('sdk', 'python', relative);
    const readSdk = (relative: string) => fs.readFileSync(inSdk(relative), 'utf8');
    const unmergedPaths = async () =>
      (await context().inspect(USABLE, Language.PYTHON, Stability.STABLE))._unsafeUnwrap().unresolved.map(String);

    /** One unresolved file of each shape, and a marked file git does not hold as unmerged. */
    const leftUnresolved = async () => {
      await ownRepository();
      const root = new DirectoryPath(sdk());
      write(inSdk('marked.ts'), 'top\r\n' + MARKERS.replace(/\n/g, '\r\n') + 'bottom\r\n');
      write(inSdk('by-hand.ts'), 'resolved by hand, not staged');
      write(inSdk('dropped.ts'), 'your edited file');
      write(inSdk('deleted-by-you.ts'), 'generated version\r\n');
      write(inSdk('logo.png'), 'yours\0binary');
      write(inSdk('not-asked.ts'), 'still ' + MARKERS);
      await leftUnmerged(root, 'marked.ts');
      await leftUnmerged(root, 'by-hand.ts');
      await leftUnmerged(root, 'dropped.ts', { yours: 'your edited file', generated: null });
      await leftUnmerged(root, 'deleted-by-you.ts', { yours: null, generated: 'generated version\n' });
      await leftUnmerged(root, 'logo.png', { yours: 'yours\0binary', generated: 'generated\0binary' });
      await leftUnmerged(root, 'gone.ts');
    };

    /** The settlement for `side` landed, and the paths taken out of the unmerged state, as the run does it. */
    const settle = async (side: Side) => {
      const plan = (await context().settlementFor(side, ASKED))._unsafeUnwrap();
      (await context().write(plan))._unsafeUnwrap();
      (await git.unstage(new DirectoryPath(sdk()), ASKED))._unsafeUnwrap();
      return plan;
    };

    it('settles each file for the generator, with its own line ending, keeps what was resolved by hand, and leaves the unmerged state', async () => {
      await leftUnresolved();

      const plan = await settle('generated');

      expect(readSdk('marked.ts')).to.equal('top\r\ntheirs\r\nbottom\r\n');
      expect(readSdk('by-hand.ts')).to.equal('resolved by hand, not staged');
      expect(readSdk('dropped.ts')).to.equal('your edited file');
      expect(readSdk('deleted-by-you.ts')).to.equal('generated version\r\n');
      expect(readSdk('logo.png')).to.equal('generated\0binary');
      expect(fs.existsSync(inSdk('gone.ts'))).to.be.false;
      expect(readSdk('not-asked.ts')).to.equal('still ' + MARKERS);
      expect(plan.deletes).to.deep.equal([]);
      expect(await unmergedPaths()).to.deep.equal([]);
    });

    it('settles each file for you, keeps what was resolved by hand, and leaves the unmerged state', async () => {
      await leftUnresolved();

      const plan = await settle('yours');

      expect(readSdk('marked.ts')).to.equal('top\r\nmine\r\nbottom\r\n');
      expect(readSdk('by-hand.ts')).to.equal('resolved by hand, not staged');
      expect(readSdk('dropped.ts')).to.equal('your edited file');
      expect(fs.existsSync(inSdk('deleted-by-you.ts'))).to.be.false;
      expect(readSdk('logo.png')).to.equal('yours\0binary');
      expect(fs.existsSync(inSdk('gone.ts'))).to.be.false;
      expect(plan.deletes.map(String)).to.deep.equal(['deleted-by-you.ts']);
      expect(await unmergedPaths()).to.deep.equal([]);
    });

    it('reports a git that does not answer, planning nothing', async () => {
      await leftUnresolved();
      sinon.stub(GitService.prototype, 'readBlobs').resolves(err('git broke'));

      expect((await context().settlementFor('generated', ASKED))._unsafeUnwrapErr()).to.equal('git broke');
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
      const landed = written || beforeWrite !== undefined ? await context(directory).write(plan) : undefined;
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

    it('adds a file the generator produced for the first time, and never touches one that is yours alone, nor its own record and the attributes beside it', async () => {
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

        (await git.stageConflicts(new DirectoryPath(directory), plan.stages))._unsafeUnwrap();

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
        expect([...kept.keys()]).to.have.members([
          'a.ts',
          'b.ts',
          'c.ts',
          '.apimatic/generation.json',
          '.apimatic/.gitattributes'
        ]);
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
