import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { GitService } from '../../src/infrastructure/git-service.js';
import { canonical } from '../../src/infrastructure/tmp-extensions.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { describeCommit, snapshotFiles } from '../helpers/snapshots.js';

const REF = 'refs/apimatic/pristine';

describe('GitService', () => {
  let root: string;
  let git: GitService;

  const write = (directory: DirectoryPath, relative: string, contents: string) => {
    const target = path.join(directory.toString(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  const repository = async (name = 'repo'): Promise<DirectoryPath> => {
    const directory = new DirectoryPath(path.join(root, name));
    fs.mkdirSync(directory.toString(), { recursive: true });
    (await git.init(directory))._unsafeUnwrap();
    return directory;
  };

  beforeEach(() => {
    root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'git-service-')));
    git = new GitService();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports the git on PATH, which this suite needs at 2.38 or newer', async () => {
    const version = await git.version();

    expect(version.isFound()).to.be.true;
    expect(version.isSupported()).to.be.true;
  });

  it('answers none when there is no git on PATH', async () => {
    const previous = process.env.PATH;
    process.env.PATH = root;
    try {
      expect((await git.version()).isFound()).to.be.false;
    } finally {
      process.env.PATH = previous;
    }
  });

  it('reports a git that cannot run in its own words, instead of taking it for absent', async () => {
    const repo = await repository();
    const broken = path.join(root, 'gitconfig');
    fs.writeFileSync(broken, '[core' + String.fromCharCode(10));
    const previous = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = broken;
    try {
      const found = await git.topLevel(repo);

      expect(found.isErr()).to.be.true;
      expect(found._unsafeUnwrapErr()).to.match(/^git rev-parse failed: .*bad config/);
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = previous;
      }
    }
  });

  it('finds the repository enclosing a directory, on main, and none outside one', async () => {
    const repo = await repository();
    const nested = repo.join('sdk', 'typescript');
    fs.mkdirSync(nested.toString(), { recursive: true });
    const outside = new DirectoryPath(path.join(root, 'elsewhere'));
    fs.mkdirSync(outside.toString());

    expect((await git.topLevel(nested))._unsafeUnwrap()?.isEqual(repo)).to.be.true;
    expect((await git.topLevel(outside))._unsafeUnwrap()).to.be.undefined;
    expect(fs.readFileSync(path.join(repo.toString(), '.git', 'HEAD'), 'utf-8').trim()).to.equal(
      'ref: refs/heads/main'
    );
  });

  it('makes a repository on main where the directory is not there yet, creating it and its parents', async () => {
    const directory = new DirectoryPath(path.join(root, 'deep er', 'sdk', 'python'));

    (await git.init(directory))._unsafeUnwrap();

    expect(fs.readFileSync(path.join(directory.toString(), '.git', 'HEAD'), 'utf-8').trim()).to.equal(
      'ref: refs/heads/main'
    );
  });

  describe('treeOf', () => {
    it('takes every file below a directory outside the repository, ignore rules or not', async () => {
      const repo = await repository();
      const generated = new DirectoryPath(path.join(root, 'generated'));
      write(generated, '.gitignore', 'dist/\n');
      write(generated, 'dist/index.js', 'built\n');
      write(generated, 'README.md', '# sdk\n');

      const tree = (await git.treeOf(repo, generated))._unsafeUnwrap();

      const commit = (await git.commitTree(repo, tree, undefined, 'generated'))._unsafeUnwrap();
      const files = await snapshotFiles(repo, commit);
      expect([...files.keys()]).to.have.members(['.gitignore', 'dist/index.js', 'README.md']);
      expect(files.get('README.md')).to.equal('# sdk\n');
    });

    it('leaves the repository’s own index and its .git alone', async () => {
      const repo = await repository();
      write(repo, 'README.md', '# sdk\n');

      const tree = (await git.treeOf(repo, repo))._unsafeUnwrap();

      const commit = (await git.commitTree(repo, tree, undefined, 'own'))._unsafeUnwrap();
      expect([...(await snapshotFiles(repo, commit)).keys()]).to.deep.equal(['README.md']);
      expect((await execa('git', ['ls-files'], { cwd: repo.toString() })).stdout).to.equal('');
    });
  });

  it('commits a tree, moves a ref to it, and finds the commit and its tree again', async () => {
    const repo = await repository();
    write(repo, 'a.txt', 'a\n');
    const tree = (await git.treeOf(repo, repo))._unsafeUnwrap();

    const first = (await git.commitTree(repo, tree, undefined, 'first'))._unsafeUnwrap();
    const second = (await git.commitTree(repo, tree, first, 'second'))._unsafeUnwrap();
    (await git.updateRef(repo, REF, second))._unsafeUnwrap();

    expect((await git.resolveRef(repo, REF))._unsafeUnwrap()).to.deep.equal(second);
    expect((await git.resolveRef(repo, 'refs/apimatic/none'))._unsafeUnwrap()).to.be.undefined;
    expect(await describeCommit(repo, second)).to.deep.equal({
      parents: [first],
      authorName: 'APIMatic CLI',
      subject: 'second'
    });
    expect((await git.treeOfCommit(repo, first))._unsafeUnwrap().isEqual(tree)).to.be.true;
  });
});
