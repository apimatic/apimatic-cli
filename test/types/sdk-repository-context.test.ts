import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import {
  inspectRepository,
  recordGeneratedDirectory,
  settleUnresolvedFiles,
  SHARE_HOOK_CALL,
  SHARE_HOOK_SCRIPT
} from '../../src/actions/sdk/generate.js';
import { canonical } from '../../src/infrastructure/tmp-extensions.js';
import { execa } from 'execa';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../src/types/git/commit-id.js';
import { RemoteName } from '../../src/types/git/remote-name.js';
import { CodeGenerationVersion, Language, Stability } from '../../src/types/sdk/generate.js';
import { GenerationRecord, RECORD_ATTRIBUTES } from '../../src/types/sdk/generation-record.js';
import { SdkGeneration } from '../../src/types/sdk/sdk-generation.js';
import { SnapshotRef } from '../../src/types/sdk/snapshot-ref.js';
import { describeCommit, recordPristine, snapshotFiles } from '../helpers/snapshots.js';

/** A ref onto itself, as `git push` and `git fetch` take it. */
const refspec = (ref: SnapshotRef): string => `${ref}:${ref}`;

const PRISTINE = SnapshotRef.pristine();

const TYPESCRIPT = SdkGeneration.create({
  language: Language.TYPESCRIPT,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
})!;

const rel = (value: string) => RelativeFilePath.fromGit(value)!;

/** An SDK directory as a test laid it out: a repository of its own, for reaching git and the disk. */
interface Sdk {
  directory: DirectoryPath;
}

describe('SdkRepositoryContext', () => {
  let root: string;
  const git = new GitService();

  const write = (directory: DirectoryPath, relative: string, contents: string) => {
    const target = path.join(directory.toString(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  const generated = (files: Record<string, string>): DirectoryPath => {
    const directory = new DirectoryPath(fs.mkdtempSync(path.join(root, 'generated-')));
    for (const [relative, contents] of Object.entries(files)) {
      write(directory, relative, contents);
    }
    return directory;
  };

  const sdkAt = (directory: DirectoryPath): Sdk => ({ directory });

  /** An SDK directory at `sdk`, made a repository of its own. */
  const project = async (sdk = path.join('sdk', 'typescript')): Promise<Sdk> => {
    const directory = new DirectoryPath(path.join(root, 'project', sdk));
    fs.mkdirSync(directory.toString(), { recursive: true });
    (await git.init(directory))._unsafeUnwrap();
    return sdkAt(directory);
  };

  const record = (sdk: Sdk, files: Record<string, string>) =>
    recordPristine(sdk.directory, generated(files), TYPESCRIPT);

  /** The commit the SDK's pristine ref names, or none. */
  const pristineOf = async (sdk: Sdk) => (await git.resolveRef(sdk.directory, PRISTINE))._unsafeUnwrap();

  const recordFile = (sdk: Sdk) => path.join(sdk.directory.toString(), '.apimatic', 'generation.json');

  const writeRecord = async (sdk: Sdk, record: GenerationRecord) =>
    write(sdk.directory, path.join('.apimatic', 'generation.json'), record.toJson());

  const plumbing = (cwd: DirectoryPath, args: string[], input?: string) =>
    execa('git', args, { cwd: cwd.toString(), input });

  /**
   * Stages 1, 2 and 3 for `path`, as a merge git ran itself would leave them:
   * your side at 2 and the generator's at 3, each left out when given as `null`, as for a file
   * that side deleted.
   */
  const unmerged = async (sdk: Sdk, path: string, sides: { yours?: string | null; generated?: string | null } = {}) => {
    const stages: [number, string | null][] = [
      [1, 'x'],
      [2, sides.yours === undefined ? 'x' : sides.yours],
      [3, sides.generated === undefined ? 'x' : sides.generated]
    ];
    const entries: string[] = [];
    for (const [stage, content] of stages) {
      if (content !== null) {
        const oid = (await plumbing(sdk.directory, ['hash-object', '-w', '--stdin'], content)).stdout.trim();
        entries.push(`100644 ${oid} ${stage}\t${path}`);
      }
    }
    await plumbing(sdk.directory, ['update-index', '-z', '--index-info'], entries.join('\0') + '\0');
  };

  const unmergedPaths = async (sdk: Sdk) =>
    (await plumbing(sdk.directory, ['ls-files', '-u'])).stdout.split('\n').filter((line) => line !== '');

  beforeEach(() => {
    root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-repository-')));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('recordPristine', () => {
    it('records the first snapshot with no parent, under the SDK directory’s ref', async () => {
      const sdk = await project();

      const commit = (
        await record(sdk, {
          'README.md': '# v1',
          'src/index.ts': 'export {};',
          '.gitignore': 'dist/\n',
          'dist/x.js': 'x'
        })
      )._unsafeUnwrap();

      expect(await pristineOf(sdk)).to.deep.equal(commit);
      expect(await describeCommit(sdk.directory, commit)).to.deep.equal({
        parents: [],
        authorName: 'APIMatic CLI',
        subject: 'apimatic: pristine typescript v4 stable'
      });
      const files = await snapshotFiles(sdk.directory, commit);
      expect([...files.keys()]).to.have.members(['README.md', 'src/index.ts', '.gitignore', 'dist/x.js']);
      expect(files.get('src/index.ts')).to.equal('export {};');
    });

    it('records an SDK whose path holds a space and a folder starting with a dot, and finds it again', async () => {
      const sdk = await project(path.join('My API', 'sdk', '.typescript'));

      const commit = (await record(sdk, { 'README.md': '# v1' }))._unsafeUnwrap();
      await writeRecord(sdk, GenerationRecord.written(TYPESCRIPT, commit));

      expect(await pristineOf(sdk)).to.deep.equal(commit);
      expect((await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrap()).to.deep.equal({
        kind: 'ready',
        base: commit
      });
    });

    it('chains the next snapshot onto the last and moves the ref', async () => {
      const sdk = await project();
      const first = (await record(sdk, { 'README.md': '# v1' }))._unsafeUnwrap();

      const second = (await record(sdk, { 'README.md': '# v2' }))._unsafeUnwrap();

      expect((await describeCommit(sdk.directory, second)).parents).to.deep.equal([first]);
      expect(await pristineOf(sdk)).to.deep.equal(second);
      expect((await snapshotFiles(sdk.directory, first)).get('README.md')).to.equal('# v1');
    });

    it('keeps the last snapshot when the generation is identical, so the record names the same commit', async () => {
      const sdk = await project();
      const first = (await record(sdk, { 'README.md': '# v1' }))._unsafeUnwrap();

      const again = (await record(sdk, { 'README.md': '# v1' }))._unsafeUnwrap();
      const changed = (await record(sdk, { 'README.md': '# v2' }))._unsafeUnwrap();

      expect(again).to.deep.equal(first);
      expect((await describeCommit(sdk.directory, changed)).parents).to.deep.equal([first]);
    });
  });

  describe('settling what the last run left unresolved', () => {
    const MARKERS = '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n';
    const ASKED = ['marked.ts', 'by-hand.ts', 'dropped.ts', 'deleted-by-you.ts', 'logo.png', 'gone.ts'].map(rel);

    const read = (sdk: Sdk, relative: string) => fs.readFileSync(sdk.directory.join(relative).toString(), 'utf8');
    const exists = (sdk: Sdk, relative: string) => fs.existsSync(sdk.directory.join(relative).toString());

    /** One unresolved file of each shape, and a marked file that git does not hold as unmerged. */
    const leftUnresolved = async () => {
      const sdk = await project();
      write(sdk.directory, 'marked.ts', 'top\n' + MARKERS + 'bottom\n');
      write(sdk.directory, 'by-hand.ts', 'resolved by hand, not staged');
      write(sdk.directory, 'dropped.ts', 'your edited file');
      write(sdk.directory, 'deleted-by-you.ts', 'generated version');
      write(sdk.directory, 'logo.png', 'yours\0binary');
      write(sdk.directory, 'not-asked.ts', 'still ' + MARKERS);
      await unmerged(sdk, 'marked.ts');
      await unmerged(sdk, 'by-hand.ts');
      await unmerged(sdk, 'dropped.ts', { yours: 'your edited file', generated: null });
      await unmerged(sdk, 'deleted-by-you.ts', { yours: null, generated: 'generated version' });
      await unmerged(sdk, 'logo.png', { yours: 'yours\0binary', generated: 'generated\0binary' });
      await unmerged(sdk, 'gone.ts');
      return sdk;
    };

    it('settles each file for the generator, keeps what was resolved by hand, and leaves the unmerged state', async () => {
      const sdk = await leftUnresolved();

      (await settleUnresolvedFiles(sdk.directory, 'generated', ASKED))._unsafeUnwrap();

      expect(read(sdk, 'marked.ts')).to.equal('top\ntheirs\nbottom\n');
      expect(read(sdk, 'by-hand.ts')).to.equal('resolved by hand, not staged');
      expect(read(sdk, 'dropped.ts')).to.equal('your edited file');
      expect(read(sdk, 'deleted-by-you.ts')).to.equal('generated version');
      expect(read(sdk, 'logo.png')).to.equal('generated\0binary');
      expect(exists(sdk, 'gone.ts')).to.be.false;
      expect(read(sdk, 'not-asked.ts')).to.equal('still ' + MARKERS);
      expect(await unmergedPaths(sdk)).to.deep.equal([]);
    });

    it('settles each file for you, keeps what was resolved by hand, and leaves the unmerged state', async () => {
      const sdk = await leftUnresolved();

      (await settleUnresolvedFiles(sdk.directory, 'yours', ASKED))._unsafeUnwrap();

      expect(read(sdk, 'marked.ts')).to.equal('top\nmine\nbottom\n');
      expect(read(sdk, 'by-hand.ts')).to.equal('resolved by hand, not staged');
      expect(read(sdk, 'dropped.ts')).to.equal('your edited file');
      expect(exists(sdk, 'deleted-by-you.ts')).to.be.false;
      expect(read(sdk, 'logo.png')).to.equal('yours\0binary');
      expect(exists(sdk, 'gone.ts')).to.be.false;
      expect(await unmergedPaths(sdk)).to.deep.equal([]);
    });
  });

  describe('the generation record', () => {
    it('is written beside the snapshot, naming it, and found by the next inspection', async () => {
      const sdk = await project();

      (await recordGeneratedDirectory(sdk.directory, generated({ 'README.md': '# v1' }), TYPESCRIPT))._unsafeUnwrap();

      const written = GenerationRecord.parse(fs.readFileSync(recordFile(sdk), 'utf8'))!;
      expect(written.isFor(TYPESCRIPT)).to.be.true;
      expect(await pristineOf(sdk)).to.deep.equal(written.pristineCommit());
      expect((await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrap()).to.deep.equal({
        kind: 'ready',
        base: written.pristineCommit()
      });
    });

    it('counts as absent when the file cannot be understood', async () => {
      const sdk = await project();
      write(sdk.directory, path.join('.apimatic', 'generation.json'), '{"schemaVersion": 2}');

      expect((await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrap()).to.deep.equal({ kind: 'noRecord' });
    });

    it('is written with attributes that merge it as binary and mark it generated', async () => {
      const sdk = await project();

      (await recordGeneratedDirectory(sdk.directory, generated({ 'README.md': '# v1' }), TYPESCRIPT))._unsafeUnwrap();

      const attributes = path.join(sdk.directory.toString(), '.apimatic', '.gitattributes');
      expect(fs.readFileSync(attributes, 'utf8')).to.equal(RECORD_ATTRIBUTES);
      const checked = await execa(
        'git',
        ['check-attr', 'merge', 'linguist-generated', '--', '.apimatic/generation.json'],
        {
          cwd: sdk.directory.toString()
        }
      );
      expect(checked.stdout.split('\n')).to.deep.equal([
        '.apimatic/generation.json: merge: binary',
        '.apimatic/generation.json: linguist-generated: true'
      ]);
    });

    it('stays yours, whole and without markers, when a pull meets a teammate’s record', async () => {
      const sh = (cwd: string, ...args: string[]) =>
        execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...args], {
          cwd,
          reject: false
        });
      /** Records a generation of `files` in the SDK repository at `sdk` and commits it; the record file as written. */
      const regenerate = async (sdk: string, files: Record<string, string>, message: string) => {
        (await recordGeneratedDirectory(new DirectoryPath(sdk), generated(files), TYPESCRIPT))._unsafeUnwrap();
        await sh(sdk, 'add', '-A');
        await sh(sdk, 'commit', '-qm', message);
        return fs.readFileSync(path.join(sdk, '.apimatic', 'generation.json'), 'utf8');
      };
      const mine = (await project()).directory.toString();
      const origin = path.join(root, 'origin.git');
      const teammate = path.join(root, 'teammate');
      await regenerate(mine, { 'README.md': '# v1' }, 'v1');
      await sh(root, 'init', '-q', '--bare', '--initial-branch=main', origin);
      await sh(mine, 'remote', 'add', 'origin', origin);
      await sh(mine, 'push', '-q', 'origin', 'main');
      await sh(root, 'clone', '-q', origin, teammate);
      await regenerate(teammate, { 'README.md': '# v2 for them' }, 'theirs');
      await sh(teammate, 'push', '-q', 'origin', 'main');
      const yours = await regenerate(mine, { 'README.md': '# v2 for me' }, 'mine');

      const pulled = await sh(mine, '-c', 'pull.rebase=false', 'pull', '-q', 'origin', 'main');

      const record = fs.readFileSync(path.join(mine, '.apimatic', 'generation.json'), 'utf8');
      expect(pulled.exitCode).to.not.equal(0);
      expect(record).to.equal(yours);
      expect(record).to.not.contain('<<<<<<<');
      expect((await sh(mine, 'status', '--porcelain', '--', '.apimatic')).stdout).to.equal(
        'UU .apimatic/generation.json'
      );
      await sh(mine, 'add', '--', '.apimatic/generation.json');
      expect((await sh(mine, 'commit', '-q', '--no-edit')).exitCode).to.equal(0);
    });
  });

  describe('inspect', () => {
    it('refuses while the repository is in the middle of an operation of the developer’s own, before anything else', async () => {
      const sdk = await project();
      fs.writeFileSync(path.join(sdk.directory.toString(), '.git', 'REBASE_HEAD'), `${'a'.repeat(40)}\n`);
      await unmerged(sdk, 'a.ts');

      expect((await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrapErr()).to.deep.equal({
        kind: 'operationInProgress',
        operation: 'rebase',
        root: sdk.directory
      });
    });

    it('names the files git holds as unmerged before looking at the record, so there is one without it too', async () => {
      const sdk = await project();
      await unmerged(sdk, 'a.ts');

      expect((await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrap()).to.deep.equal({
        kind: 'unresolved',
        paths: [rel('a.ts')]
      });
    });

    it('finds no record', async () => {
      const sdk = await project();

      expect((await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrap()).to.deep.equal({ kind: 'noRecord' });
    });

    it('finds a record for another generation', async () => {
      const sdk = await project();
      const pristine = (await record(sdk, { 'README.md': '# v1' }))._unsafeUnwrap();
      await writeRecord(
        sdk,
        GenerationRecord.written(SdkGeneration.create({ ...TYPESCRIPT, stability: Stability.BETA })!, pristine)
      );

      const state = (await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrap();

      expect(state).to.deep.equal({ kind: 'otherGeneration' });
    });

    it('finds a record whose snapshot the repository does not hold', async () => {
      const sdk = await project();
      const missing = CommitId.fromGit('f'.repeat(40))!;
      await writeRecord(sdk, GenerationRecord.written(TYPESCRIPT, missing));

      const state = (await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrap();

      expect(state.kind).to.equal('snapshotMissing');
    });

    it('names the files git holds as unmerged, whatever they hold', async () => {
      const sdk = await project();
      const pristine = (await record(sdk, { 'README.md': '# v1' }))._unsafeUnwrap();
      await writeRecord(sdk, GenerationRecord.written(TYPESCRIPT, pristine));
      write(
        sdk.directory,
        'src/a.ts',
        'one\n<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n'
      );
      write(sdk.directory, 'src/b.ts', 'resolved but not staged\n');
      write(
        sdk.directory,
        'src/c.ts',
        '<<<<<<< Your changes\nstaged with markers in it\n>>>>>>> Generated by APIMatic\n'
      );
      await unmerged(sdk, 'src/a.ts');
      await unmerged(sdk, 'src/b.ts');
      await unmerged(sdk, 'src/gone.ts');

      const state = (await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrap();

      expect(state).to.include({ kind: 'unresolved' });
      expect(state.kind === 'unresolved' && state.paths.map(String)).to.deep.equal([
        'src/a.ts',
        'src/b.ts',
        'src/gone.ts'
      ]);
    });

    it('is ready to merge against the recorded snapshot once every file is staged, markers or not', async () => {
      const sdk = await project();
      const pristine = (await record(sdk, { 'README.md': '# v1' }))._unsafeUnwrap();
      await writeRecord(sdk, GenerationRecord.written(TYPESCRIPT, pristine));
      write(sdk.directory, 'src/a.ts', '<<<<<<< Your changes\nstaged as is\n>>>>>>> Generated by APIMatic\n');
      await plumbing(sdk.directory, ['add', '--', 'src/a.ts']);

      const state = (await inspectRepository(sdk.directory, TYPESCRIPT))._unsafeUnwrap();

      expect(state.kind).to.equal('ready');
      expect(state.kind === 'ready' && state.base).to.deep.equal(pristine);
    });
  });

  describe('sharing', () => {
    const sh = (cwd: DirectoryPath | string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: cwd.toString() });

    const withOrigin = async (): Promise<{ sdk: Sdk; origin: DirectoryPath }> => {
      const origin = new DirectoryPath(path.join(root, 'origin.git'));
      await sh(root, 'init', '-q', '--bare', '--initial-branch=main', origin.toString());
      const sdk = await project();
      await sh(sdk.directory, 'remote', 'add', 'origin', origin.toString());
      return { sdk, origin };
    };

    /** A recorded generation, committed and pushed on `main`, as a developer leaves a project for a teammate. */
    const published = async (sdk: Sdk): Promise<CommitId> => {
      (await recordGeneratedDirectory(sdk.directory, generated({ 'README.md': '# v1' }), TYPESCRIPT))._unsafeUnwrap();
      await sh(sdk.directory, 'add', '.');
      await sh(sdk.directory, 'commit', '-qm', 'sdk');
      // Hooks skipped, as a tool that bypasses them pushes, so the snapshots are not shared.
      await sh(sdk.directory, 'push', '-q', '--no-verify', 'origin', 'main');
      return (await pristineOf(sdk))!;
    };

    const cloneOf = async (origin: DirectoryPath, name: string): Promise<Sdk> => {
      const clone = new DirectoryPath(path.join(root, name));
      await sh(root, 'clone', '-q', '--no-local', origin.toString(), clone.toString());
      return sdkAt(clone);
    };

    it('lets a clone merge against a snapshot it fetched', async () => {
      const { sdk, origin } = await withOrigin();
      const base = await published(sdk);
      const clone = await cloneOf(origin, 'clone');
      const before = (await inspectRepository(clone.directory, TYPESCRIPT))._unsafeUnwrap();
      expect(before).to.deep.include({
        kind: 'snapshotMissing',
        fetch: { kind: 'absent', remote: RemoteName.origin() }
      });

      await sh(sdk.directory, 'push', '-q', '--no-verify', 'origin', refspec(PRISTINE));
      const after = (await inspectRepository(clone.directory, TYPESCRIPT))._unsafeUnwrap();

      expect(after.kind === 'ready' && after.base).to.deep.equal(base);
      expect(await pristineOf(clone)).to.deep.equal(base);
    });

    it('moves its ref forward to a chain the remote continued, without a join', async () => {
      const { sdk, origin } = await withOrigin();
      const first = await published(sdk);
      await sh(sdk.directory, 'push', '-q', '--no-verify', 'origin', refspec(PRISTINE));
      const clone = await cloneOf(origin, 'clone');
      expect((await inspectRepository(clone.directory, TYPESCRIPT))._unsafeUnwrap().kind).to.equal('ready');
      const second = (await record(sdk, { 'README.md': '# v2' }))._unsafeUnwrap();
      await sh(sdk.directory, 'push', '-q', '--no-verify', 'origin', refspec(PRISTINE));
      await writeRecord(clone, GenerationRecord.written(TYPESCRIPT, second));

      const state = (await inspectRepository(clone.directory, TYPESCRIPT))._unsafeUnwrap();

      expect(state.kind === 'ready' && state.base).to.deep.equal(second);
      const tip = (await pristineOf(clone))!;
      expect(tip).to.deep.equal(second);
      expect((await describeCommit(clone.directory, tip)).parents).to.deep.equal([first]);
    });

    it('reports a remote it cannot reach, and no remote at all', async () => {
      const { sdk, origin } = await withOrigin();
      await published(sdk);
      const clone = await cloneOf(origin, 'clone');
      fs.rmSync(origin.toString(), { recursive: true, force: true });

      const unreachable = (await inspectRepository(clone.directory, TYPESCRIPT))._unsafeUnwrap();
      await sh(clone.directory, 'remote', 'remove', 'origin');
      const none = (await inspectRepository(clone.directory, TYPESCRIPT))._unsafeUnwrap();

      expect(unreachable.kind === 'snapshotMissing' && unreachable.fetch).to.deep.include({
        kind: 'failed',
        remote: RemoteName.origin()
      });
      expect(none.kind === 'snapshotMissing' && none.fetch).to.deep.equal({ kind: 'noRemote' });
    });

    it('joins its own chain with the remote’s while fetching a snapshot it lacks', async () => {
      const { sdk: a, origin } = await withOrigin();
      const first = (await record(a, { 'README.md': '# a' }))._unsafeUnwrap();
      await sh(a.directory, 'push', '-q', 'origin', refspec(PRISTINE));
      const bRoot = new DirectoryPath(path.join(root, 'b'));
      fs.mkdirSync(bRoot.toString(), { recursive: true });
      (await git.init(bRoot))._unsafeUnwrap();
      await sh(bRoot, 'remote', 'add', 'origin', origin.toString());
      const b = sdkAt(bRoot);
      const second = (await record(b, { 'README.md': '# b' }))._unsafeUnwrap();
      await writeRecord(b, GenerationRecord.written(TYPESCRIPT, first));

      const state = (await inspectRepository(b.directory, TYPESCRIPT))._unsafeUnwrap();

      expect(state.kind === 'ready' && state.base).to.deep.equal(first);
      const tip = (await pristineOf(b))!;
      expect((await describeCommit(bRoot, tip)).parents.map(String)).to.have.members([
        second.toString(),
        first.toString()
      ]);
    });
  });

  describe('the hook that shares snapshots', () => {
    const sh = (cwd: DirectoryPath | string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: cwd.toString() });

    // A developer's own `core.hooksPath`, set globally, would move every hook these tests write.
    let globalConfig: string | undefined;
    beforeEach(() => {
      globalConfig = process.env.GIT_CONFIG_GLOBAL;
      const empty = path.join(root, 'gitconfig');
      fs.writeFileSync(empty, '');
      process.env.GIT_CONFIG_GLOBAL = empty;
    });
    afterEach(() => {
      if (globalConfig === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = globalConfig;
      }
    });

    const hookFile = (sdk: Sdk, name = 'pre-push') => path.join(sdk.directory.toString(), '.git', 'hooks', name);

    /** Records a generation of `files`, which puts the hook in place; what became of the hook. */
    const install = async (sdk: Sdk, files = { 'README.md': '# v1' }) => {
      return (await recordGeneratedDirectory(sdk.directory, generated(files), TYPESCRIPT))._unsafeUnwrap();
    };

    /** An SDK repository with a bare origin, one recorded snapshot, the hook installed, and `main` committed; `origin` is one another SDK already pushes to. */
    const ready = async (name = 'project', { origin: shared }: { origin?: DirectoryPath } = {}) => {
      const origin = shared ?? new DirectoryPath(path.join(root, `${name}-origin.git`));
      if (shared === undefined) {
        await sh(root, 'init', '-q', '--bare', '--initial-branch=main', origin.toString());
      }
      const directory = new DirectoryPath(path.join(root, name));
      fs.mkdirSync(directory.toString(), { recursive: true });
      (await git.init(directory))._unsafeUnwrap();
      await sh(directory, 'remote', 'add', 'origin', origin.toString());
      const sdk = sdkAt(directory);
      await install(sdk, { 'README.md': `# ${name}` });
      const commit = (await pristineOf(sdk))!;
      write(directory, 'README.md', `# ${name}`);
      await sh(directory, 'add', '.');
      await sh(directory, 'commit', '-qm', 'sdk');
      return { sdk, origin, commit };
    };

    it('writes the script and a hook that calls it into .git/hooks, once', async () => {
      const sdk = await project();

      const first = await install(sdk);
      const second = await install(sdk);

      expect(first.kind === 'installed' && first.file.toString()).to.equal(hookFile(sdk));
      expect(first.kind === 'installed' && first.written).to.be.true;
      expect(second).to.deep.equal({ ...first, written: false });
      expect(fs.readFileSync(hookFile(sdk, 'apimatic-pre-push'), 'utf8')).to.equal(SHARE_HOOK_SCRIPT);
      const hook = fs.readFileSync(hookFile(sdk), 'utf8');
      expect(hook.split(SHARE_HOOK_CALL)).to.have.length(2);
      if (process.platform !== 'win32') {
        expect(fs.statSync(hookFile(sdk)).mode & 0o111).to.not.equal(0);
        expect(fs.statSync(hookFile(sdk, 'apimatic-pre-push')).mode & 0o111).to.not.equal(0);
      }
    });

    it('names the one line to add where git runs hooks from elsewhere, husky’s layout included', async () => {
      const sdk = await project();
      const script = hookFile(sdk, 'apimatic-pre-push');
      await sh(sdk.directory, 'config', 'core.hooksPath', '.githooks');

      const plain = await install(sdk);

      expect(plain.kind === 'elsewhere' && plain.runFrom.toString()).to.equal(
        path.join(sdk.directory.toString(), '.githooks')
      );
      expect(plain.kind === 'elsewhere' && plain.steps).to.deep.equal(['addCall', 'commit']);
      expect(plain.kind === 'elsewhere' && plain.file.toString()).to.equal(
        path.join(sdk.directory.toString(), '.githooks', 'pre-push')
      );
      expect(plain.kind === 'elsewhere' && plain.script.toString()).to.equal(script);
      expect(fs.existsSync(script)).to.be.true;
      expect(fs.existsSync(hookFile(sdk))).to.be.false;

      await sh(sdk.directory, 'config', 'core.hooksPath', '.husky/_');
      const husky = await install(sdk);

      expect(husky.kind === 'elsewhere' && husky.file.toString()).to.equal(
        path.join(sdk.directory.toString(), '.husky', 'pre-push')
      );
    });

    it('names the developer’s own hook file for a hooks path under the home directory, with no commit step', async () => {
      const sdk = await project();
      const home = path.join(root, 'home');
      await sh(sdk.directory, 'config', 'core.hooksPath', '~/.githooks');
      const previous = process.env.HOME;
      process.env.HOME = home;
      try {
        const needed = await install(sdk);

        expect(needed.kind === 'elsewhere' && needed.file.toString()).to.equal(
          path.join(home, '.githooks', 'pre-push')
        );
        expect(needed.kind === 'elsewhere' && needed.steps).to.deep.equal(['addCall']);
        expect(fs.existsSync(path.join(sdk.directory.toString(), '~'))).to.be.false;

        write(new DirectoryPath(home), path.join('.githooks', 'pre-push'), `#!/bin/sh\n${SHARE_HOOK_CALL}\n`);
        const again = await install(sdk);

        expect(again.kind).to.equal('installed');
      } finally {
        if (previous === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = previous;
        }
      }
    });

    it('is quiet once the hook elsewhere runs the script', async () => {
      const sdk = await project();
      await sh(sdk.directory, 'config', 'core.hooksPath', '.husky/_');
      write(sdk.directory, path.join('.husky', 'pre-push'), `npm test\n${SHARE_HOOK_CALL}\n`);

      const result = await install(sdk);

      expect(result.kind).to.equal('installed');
      expect(result.kind === 'installed' && result.file.toString()).to.equal(
        path.join(sdk.directory.toString(), '.husky', 'pre-push')
      );
    });

    it('leaves a hook in another language alone, naming it, unless it runs the script already', async () => {
      const sdk = await project();
      fs.mkdirSync(path.dirname(hookFile(sdk)), { recursive: true });
      fs.writeFileSync(hookFile(sdk), '#!/usr/bin/env node\nconsole.log("hi");\n');

      const result = await install(sdk);

      expect(result.kind === 'notShell' && result.shebang).to.equal('#!/usr/bin/env node');
      expect(fs.readFileSync(hookFile(sdk), 'utf8')).to.not.contain(SHARE_HOOK_CALL);

      fs.writeFileSync(
        hookFile(sdk),
        '#!/usr/bin/env node\nrequire("child_process").execSync("sh .git/hooks/apimatic-pre-push");\n'
      );
      expect((await install(sdk)).kind).to.equal('installed');
    });

    it('shares the chain when the developer pushes a branch, and is quiet about it', async () => {
      const { sdk, origin, commit } = await ready();

      const pushed = await sh(sdk.directory, 'push', '-q', 'origin', 'main');

      expect(pushed.stderr).to.not.contain('apimatic');
      expect((await git.resolveRef(origin, PRISTINE))._unsafeUnwrap()).to.deep.equal(commit);
    });

    it('shares through husky’s hook too, once it has the line', async () => {
      const { sdk, origin, commit } = await ready();
      fs.rmSync(hookFile(sdk));
      await sh(sdk.directory, 'config', 'core.hooksPath', '.husky/_');
      write(sdk.directory, path.join('.husky', '_', 'pre-push'), '#!/bin/sh\n. "$(dirname "$0")/../pre-push"\n');
      fs.chmodSync(path.join(sdk.directory.toString(), '.husky', '_', 'pre-push'), 0o755);
      write(sdk.directory, path.join('.husky', 'pre-push'), `set -e\n${SHARE_HOOK_CALL}\necho "husky ran" >&2\n`);

      const pushed = await sh(sdk.directory, 'push', '-q', 'origin', 'main');

      expect(pushed.stderr).to.contain('husky ran');
      expect(pushed.stderr).to.not.contain('apimatic');
      expect((await git.resolveRef(origin, PRISTINE))._unsafeUnwrap()).to.deep.equal(commit);
    });

    it('does not fail a push from a clone that never ran the CLI', async () => {
      const { origin } = await ready();
      const clone = new DirectoryPath(path.join(root, 'clone'));
      await sh(root, 'clone', '-q', '--no-local', origin.toString(), clone.toString());
      await sh(clone, 'config', 'core.hooksPath', '.husky/_');
      write(clone, path.join('.husky', '_', 'pre-push'), '#!/bin/sh\n. "$(dirname "$0")/../pre-push"\n');
      fs.chmodSync(clone.join('.husky', '_', 'pre-push').toString(), 0o755);
      write(clone, path.join('.husky', 'pre-push'), `set -e\n${SHARE_HOOK_CALL}\n`);
      write(clone, 'more.txt', 'more');
      await sh(clone, 'add', '.');
      await sh(clone, 'commit', '-qm', 'more');

      const pushed = await sh(clone, 'push', '-q', 'origin', 'HEAD:refs/heads/more');

      expect(pushed.exitCode).to.equal(0);
    });

    it('joins a chain another machine pushed meanwhile, at push time', async () => {
      const a = await ready('a');
      await sh(a.sdk.directory, 'push', '-q', 'origin', 'main');
      const b = await ready('b', { origin: a.origin });

      const pushed = await sh(b.sdk.directory, 'push', '-q', 'origin', 'HEAD:refs/heads/b');

      expect(pushed.stderr).to.not.contain('apimatic');
      const tip = (await git.resolveRef(a.origin, PRISTINE))._unsafeUnwrap()!;
      expect((await describeCommit(a.origin, tip)).subject).to.equal('apimatic: pristine chains joined');
      expect((await describeCommit(a.origin, tip)).parents.map(String)).to.have.members([
        b.commit.toString(),
        a.commit.toString()
      ]);
    });

    it('warns in the server’s words when the remote refuses the ref, and the branch still lands', async () => {
      const { sdk, origin } = await ready();
      fs.writeFileSync(
        path.join(origin.toString(), 'hooks', 'pre-receive'),
        '#!/bin/sh\nwhile read old new ref; do case "$ref" in refs/apimatic/*) echo "snapshots are not accepted here"; exit 1;; esac; done; exit 0\n',
        { mode: 0o755 }
      );

      const pushed = await sh(sdk.directory, 'push', '-q', 'origin', 'main');

      expect(pushed.stderr).to.contain(
        'apimatic: the SDK snapshots could not be pushed to origin: snapshots are not accepted here'
      );
      expect((await git.resolveRef(origin, PRISTINE))._unsafeUnwrap()).to.be.undefined;
      expect((await sh(origin, 'rev-parse', '--verify', 'refs/heads/main')).exitCode).to.equal(0);
    });

    it('runs ahead of a hook that was already there, which still runs', async () => {
      const { sdk, origin } = await ready();
      fs.writeFileSync(hookFile(sdk), '#!/bin/sh\necho "existing hook ran" >&2\nexit 0\n');
      await install(sdk);
      const tip = (await pristineOf(sdk))!;

      const pushed = await sh(sdk.directory, 'push', '-q', 'origin', 'main');

      expect(pushed.stderr.match(/existing hook ran/g)).to.have.length(1);
      expect((await git.resolveRef(origin, PRISTINE))._unsafeUnwrap()).to.deep.equal(tip);
    });
  });
});
