import { RelativeFilePath } from '../../src/types/file/relativeFilePath.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TextDecoder } from 'node:util';
import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { canonical } from '../../src/infrastructure/tmp-extensions.js';
import { execa } from 'execa';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { CommitId } from '../../src/types/git/commit-id.js';
import { RemoteName } from '../../src/types/git/remote-name.js';
import { SdkPath } from '../../src/types/sdk/sdk-path.js';
import { describeCommit } from '../helpers/snapshots.js';
import { SnapshotRef } from '../../src/types/sdk/snapshot-ref.js';

/** A ref onto itself, as `git push` and `git fetch` take it. */
const refspec = (ref: SnapshotRef): string => `${ref}:${ref}`;

const text = (content: Uint8Array | undefined) =>
  content === undefined ? undefined : new TextDecoder().decode(content);

const rel = (value: string) => RelativeFilePath.fromGit(value)!;

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

  const filesOf = async (repo: DirectoryPath, tree: Parameters<GitService['listTree']>[1]) => {
    const entries = (await git.listTree(repo, tree))._unsafeUnwrap();
    const blobs = (
      await git.readBlobs(
        repo,
        entries.map((entry) => entry.oid)
      )
    )._unsafeUnwrap();
    return new Map(entries.map((entry) => [entry.path.toString(), text(blobs.get(entry.oid))]));
  };

  beforeEach(() => {
    root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'git-service-')));
    git = new GitService();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports the git on PATH, which this suite needs at 2.38 or newer', async () => {
    const version = (await git.version())._unsafeUnwrap();

    expect(version?.isSupported()).to.be.true;
  });

  it('answers with no version when there is no git on PATH, which is not a failure', async () => {
    const previous = process.env.PATH;
    process.env.PATH = root;
    try {
      expect((await git.version())._unsafeUnwrap()).to.be.undefined;
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
      expect(found._unsafeUnwrapErr().reason).to.match(/^git rev-parse failed: .*bad config/);
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = previous;
      }
    }
  });

  it('finds the repository enclosing a directory, and none outside one', async () => {
    const repo = await repository();
    const nested = repo.join('sdk', 'typescript');
    fs.mkdirSync(nested.toString(), { recursive: true });
    const outside = new DirectoryPath(path.join(root, 'elsewhere'));
    fs.mkdirSync(outside.toString());

    expect((await git.topLevel(nested))._unsafeUnwrap()?.isEqual(repo)).to.be.true;
    expect((await git.topLevel(outside))._unsafeUnwrap()).to.be.undefined;
    // A hook runs the CLI with its own repository in the environment, which must not stand in for the one asked about.
    const other = await repository('other');
    process.env.GIT_DIR = other.join('.git').toString();
    try {
      expect((await git.topLevel(nested))._unsafeUnwrap()?.isEqual(repo)).to.be.true;
      expect((await git.topLevel(outside))._unsafeUnwrap()).to.be.undefined;
    } finally {
      delete process.env.GIT_DIR;
    }
    expect(fs.readFileSync(path.join(repo.toString(), '.git', 'HEAD'), 'utf-8').trim()).to.equal(
      'ref: refs/heads/main'
    );
  });

  it('lists what the ignore rules keep out below a directory: a directory whole unless something in it is tracked', async () => {
    const repo = await repository();
    const sdk = repo.join('sdk');
    write(sdk, '.gitignore', 'dist/\nbuild/\n*.log\n');
    write(sdk, 'tracked.py', 'tracked');
    write(sdk, 'build/keep.py', 'kept');
    await execa('git', ['add', '.'], { cwd: repo.toString() });
    await execa('git', ['add', '-f', 'sdk/build/keep.py'], { cwd: repo.toString() });
    write(sdk, 'untracked.py', 'untracked');
    write(sdk, 'debug.log', 'noise');
    write(sdk, 'build/out.py', 'built');
    write(sdk, 'dist/built.py', 'built');
    write(sdk, 'dist/nested/deep.py', 'built');
    write(repo, 'outside.log', 'outside');

    const ignored = (await git.ignoredBelow(sdk))._unsafeUnwrap();

    expect(ignored.files.map(String)).to.have.members(['build/out.py', 'debug.log']);
    expect(ignored.directories.map(String)).to.deep.equal(['dist']);
  });

  describe('treeOf', () => {
    it('honours the repository’s ignore rules for a directory inside it, and roots the tree at that directory', async () => {
      const repo = await repository();
      write(repo, '.gitignore', '*.env\n');
      write(repo, 'sdk/python/.env', 'secret');
      write(repo, 'sdk/python/keep.py', 'kept');
      write(repo, 'other.py', 'outside');

      const tree = (await git.treeOf(repo, repo.join('sdk', 'python'), []))._unsafeUnwrap();

      expect([...(await filesOf(repo, tree)).keys()]).to.deep.equal(['keep.py']);
    });

    it('honours the directory’s own .gitignore, except for the paths told to include', async () => {
      const repo = await repository();
      const sdk = repo.join('sdk');
      write(sdk, '.gitignore', 'dist/\n*.log\n');
      write(sdk, 'src/index.ts', 'export {};\n');
      write(sdk, 'dist/index.js', 'built\n');
      write(sdk, 'dist/generated.js', 'generated\n');
      write(sdk, 'debug.log', 'noise\n');

      const files = await filesOf(
        repo,
        (await git.treeOf(repo, sdk, ['dist/generated.js', 'missing.txt'].map(rel)))._unsafeUnwrap()
      );

      expect([...files.keys()]).to.have.members(['.gitignore', 'src/index.ts', 'dist/generated.js']);
    });

    it('takes every file with include set to all, and leaves a .git of its own out', async () => {
      const repo = await repository();
      write(repo, '.gitignore', 'dist/\n');
      write(repo, 'dist/index.js', 'built\n');
      write(repo, 'README.md', '# sdk\n');

      const files = await filesOf(repo, (await git.treeOf(repo, repo, 'all'))._unsafeUnwrap());

      expect([...files.keys()]).to.have.members(['.gitignore', 'dist/index.js', 'README.md']);
    });

    it('stores a CRLF file with LF, whatever the developer’s core.autocrlf says', async () => {
      const repo = await repository();
      write(repo, 'crlf.txt', 'one\r\ntwo\r\n');
      write(repo, 'lf.txt', 'one\ntwo\n');

      const files = await filesOf(repo, (await git.treeOf(repo, repo, 'all'))._unsafeUnwrap());

      expect(files.get('crlf.txt')).to.equal('one\ntwo\n');
      expect(files.get('lf.txt')).to.equal('one\ntwo\n');
    });

    it('keeps every byte when asked for the files as they are, and reads a last blob ending in CR whole', async () => {
      const repo = await repository();
      write(repo, 'crlf.txt', 'one\r\ntwo\r\n');
      write(repo, 'cr-at-end.bin', 'x\r');

      const entries = (
        await git.listTree(repo, (await git.treeOf(repo, repo, 'all', 'asIs'))._unsafeUnwrap())
      )._unsafeUnwrap();
      const crlf = entries.find((entry) => entry.path.toString() === 'crlf.txt')!;
      const cr = entries.find((entry) => entry.path.toString() === 'cr-at-end.bin')!;
      const blobs = (await git.readBlobs(repo, [crlf.oid, cr.oid]))._unsafeUnwrap();

      expect(Buffer.from(blobs.get(crlf.oid)!).toString()).to.equal('one\r\ntwo\r\n');
      expect([...blobs.get(cr.oid)!]).to.deep.equal([0x78, 0x0d]);
    });
  });

  it('commits a tree, moves a ref to it, and describes the commit', async () => {
    const repo = await repository();
    write(repo, 'a.txt', 'a\n');
    const tree = (await git.treeOf(repo, repo, 'all'))._unsafeUnwrap();
    const { SnapshotRef } = await import('../../src/types/sdk/snapshot-ref.js');
    const ref = SnapshotRef.pristine(SdkPath.fromGit('sdk')!);

    const first = (await git.commitTree(repo, tree, [], 'first'))._unsafeUnwrap();
    const second = (await git.commitTree(repo, tree, [first], 'second'))._unsafeUnwrap();
    (await git.updateRef(repo, ref, second))._unsafeUnwrap();

    expect((await git.resolveRef(repo, ref))._unsafeUnwrap()?.isEqual(second)).to.be.true;
    expect((await git.resolveRef(repo, SnapshotRef.pristine(SdkPath.fromGit('other')!)))._unsafeUnwrap()).to.be
      .undefined;
    expect((await git.listRefs(repo, SnapshotRef.allPristine()))._unsafeUnwrap().map(String)).to.deep.equal([
      'refs/apimatic/pristine/sdk'
    ]);
    expect(await describeCommit(repo, second)).to.deep.equal({
      parents: [first],
      authorName: 'APIMatic CLI',
      subject: 'second'
    });
    expect((await git.hasCommit(repo, first))._unsafeUnwrap()).to.be.true;
    expect((await git.treeOfCommit(repo, first))._unsafeUnwrap().isEqual(tree)).to.be.true;
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
    const from = (await git.treeOf(repo, before, 'all'))._unsafeUnwrap();
    const to = (await git.treeOf(repo, after, 'all'))._unsafeUnwrap();

    const paired = (await git.diffTrees(repo, from, to, true))._unsafeUnwrap();
    const plain = (await git.diffTrees(repo, from, to, false))._unsafeUnwrap();

    expect(
      paired.map((change) => [
        change.status,
        change.path.toString(),
        'from' in change ? change.from.toString() : undefined
      ])
    ).to.deep.equal(
      [
        ['M', 'b.txt', undefined],
        ['C', 'c.txt', undefined],
        ['R', 'moved/a.txt', 'a.txt']
      ]
        .filter(([status]) => status !== 'C')
        .concat([['A', 'c.txt', undefined]])
        .sort((x, y) => String(x[1]).localeCompare(String(y[1])))
    );
    expect(plain.map(({ status, path: changed }) => [status, changed.toString()])).to.deep.equal([
      ['D', 'a.txt'],
      ['M', 'b.txt'],
      ['A', 'c.txt'],
      ['A', 'moved/a.txt']
    ]);
    const modified = plain.find((change) => change.path.toString() === 'b.txt')!;
    expect('blob' in modified && modified.blob.toString()).to.have.lengthOf(40);
  });

  describe('mergeTree', () => {
    /** A commit in `repo` holding `files`, on `parents`. */
    const commit = async (repo: DirectoryPath, name: string, files: Record<string, string>, parents: CommitId[]) => {
      const work = new DirectoryPath(path.join(root, name));
      for (const [relative, contents] of Object.entries(files)) {
        write(work, relative, contents);
      }
      return (
        await git.commitTree(repo, (await git.treeOf(repo, work, 'all'))._unsafeUnwrap(), parents, name)
      )._unsafeUnwrap();
    };

    it('reads the merged tree, the stages of each conflicted path and the messages', async () => {
      const repo = await repository();
      const base = await commit(repo, 'base', { 'same.txt': 'one\n', 'gone.txt': 'gone\n' }, []);
      const ours = await commit(repo, 'ours', { 'same.txt': 'ours\n', 'gone.txt': 'kept\n' }, [base]);
      const theirs = await commit(repo, 'theirs', { 'same.txt': 'theirs\n' }, [base]);

      const merged = (await git.mergeTree(repo, ours, theirs))._unsafeUnwrap();

      expect(merged.stages.map(({ stage, path: staged }) => [staged.toString(), stage])).to.have.deep.members([
        ['same.txt', 1],
        ['same.txt', 2],
        ['same.txt', 3],
        ['gone.txt', 1],
        ['gone.txt', 2]
      ]);
      expect(merged.messages.map(({ paths, type }) => [paths.map(String), type])).to.have.deep.members([
        [['same.txt'], 'Auto-merging'],
        [['same.txt'], 'CONFLICT (contents)'],
        [['gone.txt'], 'CONFLICT (modify/delete)']
      ]);
      expect(merged.messages.find(({ type }) => type === 'CONFLICT (modify/delete)')?.message).to.match(
        /^CONFLICT \(modify\/delete\): gone\.txt deleted in .+ left in tree\.$/
      );
      expect((await filesOf(repo, merged.tree)).get('gone.txt')).to.equal('kept\n');
    });

    it('reads a clean merge as the merged tree and nothing else', async () => {
      const repo = await repository();
      const base = await commit(repo, 'base', { 'a.txt': 'a\n', 'b.txt': 'b\n' }, []);
      const ours = await commit(repo, 'ours', { 'a.txt': 'A\n', 'b.txt': 'b\n' }, [base]);
      const theirs = await commit(repo, 'theirs', { 'a.txt': 'a\n', 'b.txt': 'B\n' }, [base]);
      const both = await commit(repo, 'both', { 'a.txt': 'A\n', 'b.txt': 'B\n' }, []);

      const merged = (await git.mergeTree(repo, ours, theirs))._unsafeUnwrap();

      expect(merged.tree.isEqual((await git.treeOfCommit(repo, both))._unsafeUnwrap())).to.be.true;
      expect(merged.stages).to.deep.equal([]);
      expect(merged.messages).to.deep.equal([]);
    });
  });

  describe('unmergedStages', () => {
    it('lists the sides git kept for each unmerged path below the directory, from the root, and none outside it', async () => {
      const repo = await repository();
      const oid = (
        await execa('git', ['hash-object', '-w', '--stdin'], { cwd: repo.toString(), input: 'x' })
      ).stdout.trim();
      const entries = [
        ...[1, 2, 3].map((stage) => `100644 ${oid} ${stage}\tsdk/ts/b.ts`),
        ...[1, 3].map((stage) => `100644 ${oid} ${stage}\tsdk/ts/a.ts`),
        ...[1, 2].map((stage) => `100644 ${oid} ${stage}\tsdk/py/a.py`),
        `100644 ${oid} 0\tsdk/ts/clean.ts`
      ];
      await execa('git', ['update-index', '-z', '--index-info'], {
        cwd: repo.toString(),
        input: entries.join('\0') + '\0'
      });

      const listed = async (directory: string) =>
        (await git.unmergedStages(repo, SdkPath.fromGit(directory)!))
          ._unsafeUnwrap()
          .map((entry) => `${entry.path}:${entry.stage}:${entry.oid.toString() === oid}`);

      expect(await listed('sdk/ts')).to.deep.equal([
        'sdk/ts/a.ts:1:true',
        'sdk/ts/a.ts:3:true',
        'sdk/ts/b.ts:1:true',
        'sdk/ts/b.ts:2:true',
        'sdk/ts/b.ts:3:true'
      ]);
      expect(await listed('')).to.include.members(['sdk/py/a.py:1:true', 'sdk/py/a.py:2:true']);
      expect((await git.unmergedStages(repo, SdkPath.fromGit('docs')!))._unsafeUnwrap()).to.deep.equal([]);
    });
  });

  describe('remotes', () => {
    const ref = SnapshotRef.pristine(SdkPath.fromGit('sdk/typescript')!);

    const bare = async (name = 'origin.git'): Promise<DirectoryPath> => {
      const directory = new DirectoryPath(path.join(root, name));
      await execa('git', ['init', '-q', '--bare', '--initial-branch=main', directory.toString()]);
      return directory;
    };

    const withRemote = async (name: string, origin: DirectoryPath): Promise<DirectoryPath> => {
      const repo = await repository(name);
      await execa('git', ['remote', 'add', 'origin', origin.toString()], { cwd: repo.toString() });
      return repo;
    };

    /** One more snapshot on `ref` in `repo`, holding `content`. */
    const snapshot = async (repo: DirectoryPath, content: string) => {
      const work = new DirectoryPath(path.join(root, `work-${content}`));
      write(work, 'a.txt', content);
      const tree = (await git.treeOf(repo, work, 'all'))._unsafeUnwrap();
      const parent = (await git.resolveRef(repo, ref))._unsafeUnwrap();
      const commit = (
        await git.commitTree(repo, tree, parent === undefined ? [] : [parent], 'snapshot')
      )._unsafeUnwrap();
      (await git.updateRef(repo, ref, commit))._unsafeUnwrap();
      return commit;
    };

    it('names the remote the current branch pushes to, else origin, else none', async () => {
      const repo = await repository();
      expect((await git.remoteOf(repo))._unsafeUnwrap()).to.be.undefined;

      await execa('git', ['remote', 'add', 'origin', (await bare()).toString()], { cwd: repo.toString() });
      expect((await git.remoteOf(repo))._unsafeUnwrap()?.toString()).to.equal('origin');

      await execa('git', ['remote', 'add', 'fork', (await bare('fork.git')).toString()], { cwd: repo.toString() });
      await execa('git', ['config', 'branch.main.remote', 'fork'], { cwd: repo.toString() });
      expect((await git.remoteOf(repo))._unsafeUnwrap()?.toString()).to.equal('fork');
    });

    it('fetches a ref with its objects, and answers with nothing for a ref the remote lacks', async () => {
      const origin = await bare();
      const a = await withRemote('a', origin);
      const b = await withRemote('b', origin);
      const first = await snapshot(a, 'one');
      await execa('git', ['push', '-q', 'origin', refspec(ref)], { cwd: a.toString() });

      expect(
        (
          await git.fetchRef(b, RemoteName.origin(), SnapshotRef.pristine(SdkPath.fromGit('elsewhere')!))
        )._unsafeUnwrap()
      ).to.be.undefined;
      const tip = (await git.fetchRef(b, RemoteName.origin(), ref))._unsafeUnwrap();

      expect(tip?.isEqual(first)).to.be.true;
      expect((await git.hasCommit(b, first))._unsafeUnwrap()).to.be.true;
    });

    it('names git’s own hooks directory, and whether core.hooksPath moved the hooks elsewhere', async () => {
      const repo = await repository();
      const own = path.join(repo.toString(), '.git', 'hooks');

      expect((await git.hooksDirectory(repo))._unsafeUnwrap().toString()).to.equal(own);
      expect((await git.hooksPathConfigured(repo))._unsafeUnwrap()).to.be.undefined;
      expect((await git.hooksRunFrom(repo))._unsafeUnwrap().toString()).to.equal(own);

      await execa('git', ['config', 'core.hooksPath', '.husky'], { cwd: repo.toString() });

      expect((await git.hooksPathConfigured(repo))._unsafeUnwrap()).to.equal('.husky');
      expect((await git.hooksDirectory(repo))._unsafeUnwrap().toString()).to.equal(own);
      expect((await git.hooksRunFrom(repo))._unsafeUnwrap().toString()).to.equal(path.join(repo.toString(), '.husky'));
    });

    it('resolves a hooks path under the home directory as git does, not under the repository', async () => {
      const repo = await repository();
      const home = path.join(root, 'home');
      await execa('git', ['config', 'core.hooksPath', '~/.githooks'], { cwd: repo.toString() });
      const previous = process.env.HOME;
      process.env.HOME = home;
      try {
        expect((await git.hooksRunFrom(repo))._unsafeUnwrap().toString()).to.equal(path.join(home, '.githooks'));
      } finally {
        if (previous === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = previous;
        }
      }
    });

    it('leaves an SSH client the developer configured in charge of the connection', async () => {
      const repo = await repository();
      const marker = path.join(root, 'ssh-ran').replace(/\\/g, '/');
      const script = path.join(root, 'ssh.sh').replace(/\\/g, '/');
      fs.writeFileSync(script, `printf x > "${marker}"\nexit 1\n`);
      await execa('git', ['config', 'core.sshCommand', `sh "${script}"`], { cwd: repo.toString() });

      const fetched = await git.fetchRef(repo, RemoteName.fromGit('ssh://example.invalid/sdk.git')!, ref);

      expect(fetched.isErr()).to.be.true;
      expect(fs.existsSync(marker)).to.be.true;
    });

    it('tells an ancestor from a stranger', async () => {
      const repo = await repository();
      const first = await snapshot(repo, 'one');
      const second = await snapshot(repo, 'two');

      expect((await git.isAncestor(repo, first, second))._unsafeUnwrap()).to.be.true;
      expect((await git.isAncestor(repo, second, first))._unsafeUnwrap()).to.be.false;
    });
  });
});
