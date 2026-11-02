import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { err } from 'neverthrow';
import sinon from 'sinon';
import { GitService } from '../../src/infrastructure/git-service.js';
import { canonical } from '../../src/infrastructure/tmp-extensions.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { GitContext } from '../../src/types/git-context.js';
import { GitVersion } from '../../src/types/git/git-version.js';
import { describeCommit, snapshotFiles } from '../helpers/snapshots.js';

/** Where the SDK directory's own repository keeps each generation as the server returned it. */
const PRISTINE_REF = 'refs/apimatic/pristine';

describe('GitContext', () => {
  let root: string;
  const git = new GitService();

  const inRoot = (...segments: string[]) => path.join(root, ...segments);
  const sdk = () => inRoot('sdk', 'python');
  const context = (directory = sdk()) => new GitContext(new DirectoryPath(directory));
  /** A git that can serve the feature, for the questions that need one. */
  const USABLE = GitVersion.parse('git version 2.38.0');

  const write = (file: string, contents: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };

  /** A directory of generated files, beside the SDK directory. */
  const generated = (files: Record<string, string>): DirectoryPath => {
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

  describe('isRepository', () => {
    it('is true for the SDK directory’s own repository, also inside one that encloses it, and records there', async () => {
      await ownRepository(root);
      await ownRepository();

      expect((await context().isRepository(USABLE))._unsafeUnwrap()).to.be.true;

      (await context().recordSnapshot(generated({ 'README.md': '# sdk' })))._unsafeUnwrap();
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

    for (const [what, git] of [
      ['no git', GitVersion.none()],
      ['a git too old', GitVersion.parse('git version 2.30.2')]
    ] as const) {
      it(`is false for ${what}, running none, even in the directory’s own repository`, async () => {
        await ownRepository();
        const topLevel = sinon.stub(GitService.prototype, 'topLevel');

        expect((await context().isRepository(git))._unsafeUnwrap()).to.be.false;

        expect(topLevel.called).to.be.false;
      });
    }
  });

  describe('recordSnapshot', () => {
    it('records the first snapshot with no parent, under the pristine ref, with every file', async () => {
      await ownRepository();

      const commit = (
        await context().recordSnapshot(
          generated({ 'README.md': '# v1', 'src/index.py': 'x', '.gitignore': 'dist/\n', 'dist/x.py': 'x' })
        )
      )._unsafeUnwrap();

      expect(await pristineAt(sdk())).to.deep.equal(commit);
      expect(await describeCommit(new DirectoryPath(sdk()), commit)).to.deep.equal({
        parents: [],
        authorName: 'APIMatic CLI',
        subject: 'apimatic: pristine'
      });
      const files = await snapshotFiles(new DirectoryPath(sdk()), commit);
      expect([...files.keys()]).to.have.members(['README.md', 'src/index.py', '.gitignore', 'dist/x.py']);
      expect(files.get('src/index.py')).to.equal('x');
    });

    it('records an SDK whose path holds a space and a folder starting with a dot, and finds it again', async () => {
      const directory = inRoot('My API', 'sdk', '.python');
      await ownRepository(directory);

      const commit = (await context(directory).recordSnapshot(generated({ 'README.md': '# v1' })))._unsafeUnwrap();

      expect(await pristineAt(directory)).to.deep.equal(commit);
      expect((await context(directory).isRepository(USABLE))._unsafeUnwrap()).to.be.true;
    });

    it('chains the next snapshot onto the last and moves the ref', async () => {
      await ownRepository();
      const first = (await context().recordSnapshot(generated({ 'README.md': '# v1' })))._unsafeUnwrap();

      const second = (await context().recordSnapshot(generated({ 'README.md': '# v2' })))._unsafeUnwrap();

      expect((await describeCommit(new DirectoryPath(sdk()), second)).parents).to.deep.equal([first]);
      expect(await pristineAt(sdk())).to.deep.equal(second);
      expect((await snapshotFiles(new DirectoryPath(sdk()), first)).get('README.md')).to.equal('# v1');
    });

    it('keeps the last snapshot when the generation is identical', async () => {
      await ownRepository();
      const first = (await context().recordSnapshot(generated({ 'README.md': '# v1' })))._unsafeUnwrap();

      const again = (await context().recordSnapshot(generated({ 'README.md': '# v1' })))._unsafeUnwrap();
      const changed = (await context().recordSnapshot(generated({ 'README.md': '# v2' })))._unsafeUnwrap();

      expect(again).to.deep.equal(first);
      expect((await describeCommit(new DirectoryPath(sdk()), changed)).parents).to.deep.equal([first]);
    });

    it('leaves the repository’s own index alone', async () => {
      await ownRepository();

      (await context().recordSnapshot(generated({ 'README.md': '# v1' })))._unsafeUnwrap();

      expect((await execa('git', ['ls-files'], { cwd: sdk() })).stdout).to.equal('');
    });
  });
});
