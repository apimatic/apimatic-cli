import fs from 'fs';
import os from 'os';
import path from 'path';
import { TextDecoder } from 'node:util';
import { expect } from 'chai';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';

const text = (content: Uint8Array | undefined) =>
  content === undefined ? undefined : new TextDecoder().decode(content);

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
    await git.init(directory);
    return directory;
  };

  const filesOf = async (repo: DirectoryPath, tree: Parameters<GitService['listTree']>[1]) => {
    const entries = await git.listTree(repo, tree);
    const blobs = await git.readBlobs(
      repo,
      entries.map((entry) => entry.oid)
    );
    return new Map(entries.map((entry) => [entry.path, text(blobs.get(entry.oid))]));
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-service-'));
    git = new GitService();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports the git on PATH, which this suite needs at 2.38 or newer', async () => {
    const version = await git.version();

    expect(version?.isSupported()).to.be.true;
  });

  it('finds the repository enclosing a directory, and none outside one', async () => {
    const repo = await repository();
    const nested = repo.join('sdk', 'typescript');
    fs.mkdirSync(nested.toString(), { recursive: true });
    const outside = new DirectoryPath(path.join(root, 'elsewhere'));
    fs.mkdirSync(outside.toString());

    expect((await git.topLevel(nested))?.isEqual(repo)).to.be.true;
    expect(await git.topLevel(outside)).to.be.undefined;
    expect(fs.readFileSync(path.join(repo.toString(), '.git', 'HEAD'), 'utf-8').trim()).to.equal(
      'ref: refs/heads/main'
    );
  });

  describe('treeOf', () => {
    it('honours the directory’s own .gitignore, except for the paths told to include', async () => {
      const repo = await repository();
      const sdk = repo.join('sdk');
      write(sdk, '.gitignore', 'dist/\n*.log\n');
      write(sdk, 'src/index.ts', 'export {};\n');
      write(sdk, 'dist/index.js', 'built\n');
      write(sdk, 'dist/generated.js', 'generated\n');
      write(sdk, 'debug.log', 'noise\n');

      const files = await filesOf(repo, await git.treeOf(repo, sdk, ['dist/generated.js', 'missing.txt']));

      expect([...files.keys()]).to.have.members(['.gitignore', 'src/index.ts', 'dist/generated.js']);
    });

    it('takes every file with include set to all, and leaves a .git of its own out', async () => {
      const repo = await repository();
      write(repo, '.gitignore', 'dist/\n');
      write(repo, 'dist/index.js', 'built\n');
      write(repo, 'README.md', '# sdk\n');

      const files = await filesOf(repo, await git.treeOf(repo, repo, 'all'));

      expect([...files.keys()]).to.have.members(['.gitignore', 'dist/index.js', 'README.md']);
    });

    it('stores a CRLF file with LF, whatever the developer’s core.autocrlf says', async () => {
      const repo = await repository();
      write(repo, 'crlf.txt', 'one\r\ntwo\r\n');
      write(repo, 'lf.txt', 'one\ntwo\n');

      const files = await filesOf(repo, await git.treeOf(repo, repo, 'all'));

      expect(files.get('crlf.txt')).to.equal('one\ntwo\n');
      expect(files.get('lf.txt')).to.equal('one\ntwo\n');
    });
  });

  it('commits a tree, moves a ref to it, and describes the commit', async () => {
    const repo = await repository();
    write(repo, 'a.txt', 'a\n');
    const tree = await git.treeOf(repo, repo, 'all');
    const { SnapshotRef } = await import('../../src/types/sdk/snapshot-ref.js');
    const ref = SnapshotRef.pristine('sdk');

    const first = await git.commitTree(repo, tree, [], 'first');
    const second = await git.commitTree(repo, tree, [first], 'second');
    await git.updateRef(repo, ref, second);

    expect((await git.resolveRef(repo, ref))?.isEqual(second)).to.be.true;
    expect(await git.resolveRef(repo, SnapshotRef.pristine('other'))).to.be.undefined;
    expect(await git.listRefs(repo, 'refs/apimatic/pristine')).to.deep.equal(['refs/apimatic/pristine/sdk']);
    expect(await git.describe(repo, second)).to.deep.equal({
      parents: [first],
      authorName: 'APIMatic CLI',
      subject: 'second'
    });
    expect(await git.hasCommit(repo, first)).to.be.true;
    expect((await git.treeOfCommit(repo, first)).isEqual(tree)).to.be.true;
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
    const from = await git.treeOf(repo, before, 'all');
    const to = await git.treeOf(repo, after, 'all');

    const paired = await git.diffTrees(repo, from, to, true);
    const plain = await git.diffTrees(repo, from, to, false);

    expect(paired.map(({ status, path: changed, from: origin }) => [status, changed, origin])).to.deep.equal(
      [
        ['M', 'b.txt', undefined],
        ['C', 'c.txt', undefined],
        ['R', 'moved/a.txt', 'a.txt']
      ]
        .filter(([status]) => status !== 'C')
        .concat([['A', 'c.txt', undefined]])
        .sort((x, y) => String(x[1]).localeCompare(String(y[1])))
    );
    expect(plain.map(({ status, path: changed }) => [status, changed])).to.deep.equal([
      ['D', 'a.txt'],
      ['M', 'b.txt'],
      ['A', 'c.txt'],
      ['A', 'moved/a.txt']
    ]);
    expect(plain.find((change) => change.path === 'b.txt')?.blob).to.have.lengthOf(40);
  });
});
