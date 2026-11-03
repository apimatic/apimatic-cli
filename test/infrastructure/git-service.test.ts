import { Buffer } from 'node:buffer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { GitService } from '../../src/infrastructure/git-service.js';
import { canonical } from '../../src/infrastructure/tmp-extensions.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { BlobId } from '../../src/types/git/blob-id.js';
import { CommitId } from '../../src/types/git/commit-id.js';
import { StageEntry } from '../../src/types/git/merge-tree.js';
import { GitOperation } from '../../src/types/git/git-operation.js';
import { TreeId } from '../../src/types/git/tree-id.js';
import { leftUnmerged, rel } from '../helpers/merge.js';
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

  /** Every file a tree holds, by path, as text. */
  const filesOf = async (repo: DirectoryPath, tree: TreeId | CommitId) => {
    const entries = (await git.listTree(repo, tree))._unsafeUnwrap();
    const contents = (
      await git.readBlobs(
        repo,
        entries.map((entry) => entry.oid)
      )
    )._unsafeUnwrap();
    return new Map(entries.map((entry, index) => [entry.path.toString(), Buffer.from(contents[index]).toString()]));
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

  it('commits a tree, moves a ref to it, finds the commit and its tree again, and knows which commits it holds', async () => {
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
    expect((await git.hasCommit(repo, first))._unsafeUnwrap()).to.be.true;
    expect((await git.hasCommit(repo, CommitId.fromGit('f'.repeat(40))!))._unsafeUnwrap()).to.be.false;
  });

  describe('trees with line endings normalised', () => {
    it('stores a CRLF file with LF, whatever the developer’s core.autocrlf says', async () => {
      const repo = await repository();
      write(repo, 'crlf.txt', 'one\r\ntwo\r\n');
      write(repo, 'lf.txt', 'one\ntwo\n');

      const files = await filesOf(repo, (await git.treeOf(repo, repo))._unsafeUnwrap());

      expect(files.get('crlf.txt')).to.equal('one\ntwo\n');
      expect(files.get('lf.txt')).to.equal('one\ntwo\n');
    });

    it('honours the repository’s ignore rules for its working tree, except for the paths told to include', async () => {
      const repo = await repository();
      write(repo, '.gitignore', 'dist/\n*.log\n');
      write(repo, 'src/index.ts', 'export {};\n');
      write(repo, 'dist/index.js', 'built\n');
      write(repo, 'dist/generated.js', 'generated\n');
      write(repo, 'debug.log', 'noise\n');

      const tree = (await git.treeOfDirectory(repo, ['dist/generated.js', 'missing.txt'].map(rel)))._unsafeUnwrap();

      expect([...(await filesOf(repo, tree)).keys()]).to.have.members([
        '.gitignore',
        'src/index.ts',
        'dist/generated.js'
      ]);
    });

    it('reads a blob byte for byte, a last one ending in CR whole', async () => {
      const repo = await repository();
      write(repo, 'cr-at-end.bin', 'x\r');
      write(repo, 'a.txt', 'a\n');
      const entries = (await git.listTree(repo, (await git.treeOf(repo, repo))._unsafeUnwrap()))._unsafeUnwrap();
      const cr = entries.find((entry) => entry.path.toString() === 'cr-at-end.bin')!;

      const contents = (await git.readBlobs(repo, [cr.oid]))._unsafeUnwrap();

      expect([...contents[0]]).to.deep.equal([0x78, 0x0d]);
    });
  });

  it('keeps every byte when asked for the working tree as it is', async () => {
    const repo = await repository();
    write(repo, 'crlf.txt', 'one\r\ntwo\r\n');

    const files = await filesOf(repo, (await git.treeOfDirectoryAsIs(repo, []))._unsafeUnwrap());

    expect(files.get('crlf.txt')).to.equal('one\r\ntwo\r\n');
  });

  it('diffs two trees, pairing a moved file only when asked to', async () => {
    const repo = await repository();
    const before = repo.join('before');
    const after = repo.join('after');
    write(before, 'a.txt', 'one\ntwo\nthree\n');
    write(before, 'b.txt', 'b\n');
    write(after, 'moved/a.txt', 'one\ntwo\nthree\n');
    write(after, 'b.txt', 'B\n');
    write(after, 'c.txt', 'c\n');
    const from = (await git.treeOf(repo, before))._unsafeUnwrap();
    const to = (await git.treeOf(repo, after))._unsafeUnwrap();

    const paired = (await git.diffTreesPairingRenames(repo, from, to))._unsafeUnwrap();
    const plain = (await git.diffTrees(repo, from, to))._unsafeUnwrap();

    const byPath = (changes: typeof paired) =>
      changes
        .map((change) => [change.status, change.path.toString(), 'from' in change ? change.from.toString() : undefined])
        .sort((x, y) => String(x[1]).localeCompare(String(y[1])));
    expect(byPath(paired)).to.deep.equal([
      ['M', 'b.txt', undefined],
      ['A', 'c.txt', undefined],
      ['R', 'moved/a.txt', 'a.txt']
    ]);
    expect(byPath(plain)).to.deep.equal([
      ['D', 'a.txt', undefined],
      ['M', 'b.txt', undefined],
      ['A', 'c.txt', undefined],
      ['A', 'moved/a.txt', undefined]
    ]);
    const modified = plain.find((change) => change.path.toString() === 'b.txt')!;
    expect('blob' in modified && modified.blob.toString()).to.have.lengthOf(40);
  });

  describe('mergeTree', () => {
    /** A commit in `repo` holding `files`, on `parent`. */
    const commit = async (
      repo: DirectoryPath,
      name: string,
      files: Record<string, string>,
      parent: CommitId | undefined
    ) => {
      const work = new DirectoryPath(path.join(root, name));
      for (const [relative, contents] of Object.entries(files)) {
        write(work, relative, contents);
      }
      return (await git.commitTree(repo, (await git.treeOf(repo, work))._unsafeUnwrap(), parent, name))._unsafeUnwrap();
    };

    it('reads the merged tree, the stages of each conflicted path and the messages', async () => {
      const repo = await repository();
      const base = await commit(repo, 'base', { 'same.txt': 'one\n', 'gone.txt': 'gone\n' }, undefined);
      const ours = await commit(repo, 'ours', { 'same.txt': 'ours\n', 'gone.txt': 'kept\n' }, base);
      const theirs = await commit(repo, 'theirs', { 'same.txt': 'theirs\n' }, base);

      const merged = (await git.mergeTree(repo, ours, theirs))._unsafeUnwrap();

      expect(merged.stages.map(({ stage, path: staged }) => [staged.toString(), stage])).to.have.deep.members([
        ['same.txt', 1],
        ['same.txt', 2],
        ['same.txt', 3],
        ['gone.txt', 1],
        ['gone.txt', 2]
      ]);
      expect(merged.messages.map(({ paths, kind }) => [paths.map(String), kind])).to.have.deep.members([
        [['same.txt'], 'informational'],
        [['same.txt'], 'contents'],
        [['gone.txt'], 'modifyDelete']
      ]);
      expect((await filesOf(repo, merged.tree)).get('gone.txt')).to.equal('kept\n');
    });

    it('reads a clean merge as the merged tree and nothing else', async () => {
      const repo = await repository();
      const base = await commit(repo, 'base', { 'a.txt': 'a\n', 'b.txt': 'b\n' }, undefined);
      const ours = await commit(repo, 'ours', { 'a.txt': 'A\n', 'b.txt': 'b\n' }, base);
      const theirs = await commit(repo, 'theirs', { 'a.txt': 'a\n', 'b.txt': 'B\n' }, base);
      const both = await commit(repo, 'both', { 'a.txt': 'A\n', 'b.txt': 'B\n' }, undefined);

      const merged = (await git.mergeTree(repo, ours, theirs))._unsafeUnwrap();

      expect(merged.tree.isEqual((await git.treeOfCommit(repo, both))._unsafeUnwrap())).to.be.true;
      expect(merged.stages).to.deep.equal([]);
      expect(merged.messages).to.deep.equal([]);
    });
  });

  describe('stageConflicts', () => {
    const blobOf = async (repo: DirectoryPath, contents: string) => {
      const { stdout } = await execa('git', ['hash-object', '-w', '--stdin'], {
        cwd: repo.toString(),
        input: contents
      });
      return BlobId.fromGit(stdout.trim())!;
    };
    const entry = (relative: string, stage: StageEntry['stage'], oid: BlobId): StageEntry => ({
      mode: '100644',
      oid,
      stage,
      path: rel(relative)
    });
    /** Every index entry as `[path, stage, oid]`. */
    const indexOf = async (repo: DirectoryPath) => {
      const { stdout } = await execa('git', ['ls-files', '--stage'], { cwd: repo.toString() });
      return stdout
        .trim()
        .split('\n')
        .map((line) => {
          const [entry, relative] = line.split('\t');
          const [, oid, stage] = entry.split(' ');
          return [relative, Number(stage), oid];
        });
    };

    it("puts each path into the repository's own index at the stages given, replacing what the index held for it", async () => {
      const repo = await repository();
      write(repo, 'same.txt', 'resolved\n');
      write(repo, 'other.txt', 'other\n');
      await execa('git', ['add', '.'], { cwd: repo.toString() });
      const base = await blobOf(repo, 'base\n');
      const ours = await blobOf(repo, 'ours\n');
      const theirs = await blobOf(repo, 'theirs\n');

      const staged = await git.stageConflicts(repo, [
        entry('same.txt', 1, base),
        entry('same.txt', 2, ours),
        entry('same.txt', 3, theirs)
      ]);

      expect(staged.isOk()).to.be.true;
      const index = await indexOf(repo);
      expect(index.map(([relative, stage]) => [relative, stage])).to.have.deep.members([
        ['other.txt', 0],
        ['same.txt', 1],
        ['same.txt', 2],
        ['same.txt', 3]
      ]);
      expect(index.filter(([relative]) => relative === 'same.txt')).to.have.deep.members([
        ['same.txt', 1, base.toString()],
        ['same.txt', 2, ours.toString()],
        ['same.txt', 3, theirs.toString()]
      ]);
    });

    it('leaves the index alone when there is nothing to stage', async () => {
      const repo = await repository();
      write(repo, 'a.txt', 'a\n');
      await execa('git', ['add', '.'], { cwd: repo.toString() });

      expect((await git.stageConflicts(repo, [])).isOk()).to.be.true;
      expect((await indexOf(repo)).map(([relative, stage]) => [relative, stage])).to.deep.equal([['a.txt', 0]]);
    });
  });

  describe('unmergedStages', () => {
    it('lists the sides git kept for each unmerged path, and nothing for a merged one or an empty index', async () => {
      const repo = await repository();
      expect((await git.unmergedStages(repo))._unsafeUnwrap()).to.deep.equal([]);
      write(repo, 'merged.txt', 'fine\n');
      await execa('git', ['add', '.'], { cwd: repo.toString() });
      await leftUnmerged(repo, 'both.txt');
      await leftUnmerged(repo, 'dropped.txt', { generated: null });

      const listed = (await git.unmergedStages(repo))._unsafeUnwrap();

      expect(listed.map((entry) => [entry.path.toString(), entry.stage])).to.have.deep.members([
        ['both.txt', 1],
        ['both.txt', 2],
        ['both.txt', 3],
        ['dropped.txt', 1],
        ['dropped.txt', 2]
      ]);
      expect(listed.every((entry) => entry.mode === '100644')).to.be.true;
    });
  });

  describe('operationInProgress', () => {
    it('names the operation by the file git leaves while it is under way, and none otherwise', async () => {
      const repo = await repository();
      const gitFile = (name: string) => path.join(repo.toString(), '.git', name);

      expect((await git.operationInProgress(repo))._unsafeUnwrap().isUnderWay()).to.be.false;
      for (const [mark, name] of [
        ['MERGE_HEAD', 'merge'],
        ['REBASE_HEAD', 'rebase'],
        ['CHERRY_PICK_HEAD', 'cherry-pick'],
        ['REVERT_HEAD', 'revert']
      ]) {
        fs.writeFileSync(gitFile(mark), `${'a'.repeat(40)}\n`);
        const operation = (await git.operationInProgress(repo))._unsafeUnwrap();
        expect(operation.isUnderWay(), mark).to.be.true;
        expect(operation.toString(), mark).to.equal(name);
        fs.rmSync(gitFile(mark));
      }
      expect(GitOperation.marks()).to.deep.equal(['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']);
      expect(GitOperation.markedBy('HEAD').isUnderWay()).to.be.false;
    });
  });

  describe('unstage', () => {
    it('takes the paths out of the unmerged state and leaves the files on disk, with or without a HEAD', async () => {
      const repo = await repository();
      write(repo, 'a.txt', 'settled\n');
      await leftUnmerged(repo, 'a.txt');
      await leftUnmerged(repo, 'b.txt');

      (await git.unstage(repo, [rel('a.txt')]))._unsafeUnwrap();

      const left = (await git.unmergedStages(repo))._unsafeUnwrap();
      expect(left.map((entry) => entry.path.toString())).to.deep.equal(['b.txt', 'b.txt', 'b.txt']);
      expect(fs.readFileSync(path.join(repo.toString(), 'a.txt'), 'utf8')).to.equal('settled\n');

      const tree = (await git.treeOf(repo, repo))._unsafeUnwrap();
      const head = (await git.commitTree(repo, tree, undefined, 'first'))._unsafeUnwrap();
      (await git.updateRef(repo, 'HEAD', head))._unsafeUnwrap();
      await leftUnmerged(repo, 'a.txt');

      (await git.unstage(repo, [rel('a.txt'), rel('b.txt')]))._unsafeUnwrap();

      expect((await git.unmergedStages(repo))._unsafeUnwrap()).to.deep.equal([]);
      const { stdout } = await execa('git', ['ls-files', '--stage'], { cwd: repo.toString() });
      expect(stdout.split('\n').map((line) => line.split('\t')[1])).to.deep.equal(['a.txt']);
      expect((await git.unstage(repo, [])).isOk()).to.be.true;
    });
  });
});
