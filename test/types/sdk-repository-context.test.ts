import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { canonical } from '../../src/infrastructure/tmp-extensions.js';
import { execa } from 'execa';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../src/types/git/commit-id.js';
import { SdkContext } from '../../src/types/sdk-context.js';
import { SdkRepositoryContext } from '../../src/types/sdk-repository-context.js';
import { CodeGenerationVersion, Language, Stability } from '../../src/types/sdk/generate.js';
import { GenerationRecord, SdkGeneration } from '../../src/types/sdk/generation-record.js';
import { SHARE_HOOK_BLOCK, SHARE_HOOK_CALL, SHARE_HOOK_SCRIPT } from '../../src/types/sdk/share-hook.js';
import { SnapshotRef } from '../../src/types/sdk/snapshot-ref.js';
import { snapshotFiles } from '../helpers/snapshots.js';

const TYPESCRIPT: SdkGeneration = {
  language: Language.TYPESCRIPT,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
};

const rel = (value: string) => RelativeFilePath.fromGit(value);

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

  const record = async (repository: SdkRepositoryContext, files: Record<string, string>) => {
    const tree = (await repository.snapshotGenerated(generated(files)))._unsafeUnwrap();
    return repository.recordPristine(tree, TYPESCRIPT);
  };

  /** The context for an SDK directory whose language directory is `sdk`'s last segment, below `parent`. */
  const contextFor = (sdk: DirectoryPath) => new SdkContext(path.basename(sdk.toString()) as Language, sdk.join('..'));

  const project = async (sdk = path.join('sdk', 'typescript')): Promise<SdkRepositoryContext> => {
    const projectDirectory = new DirectoryPath(path.join(root, 'project'));
    fs.mkdirSync(projectDirectory.join(sdk).toString(), { recursive: true });
    await git.init(projectDirectory);
    return (await contextFor(projectDirectory.join(sdk)).repository())!;
  };

  const writeRecord = async (repository: SdkRepositoryContext, record: GenerationRecord) =>
    write(repository.sdkDirectory(), path.join('.apimatic', 'generation.json'), record.toJson());

  const plumbing = (cwd: DirectoryPath, args: string[], input?: string) =>
    execa('git', args, { cwd: cwd.toString(), input });

  /**
   * Stages 1, 2 and 3 for `path` (from the root), as a merge git ran itself would leave them:
   * your side at 2 and the generator's at 3, each left out when given as `null`, as for a file
   * that side deleted.
   */
  const unmerged = async (
    repository: SdkRepositoryContext,
    path: string,
    sides: { yours?: string | null; generated?: string | null } = {}
  ) => {
    const stages: [number, string | null][] = [
      [1, 'x'],
      [2, sides.yours === undefined ? 'x' : sides.yours],
      [3, sides.generated === undefined ? 'x' : sides.generated]
    ];
    const entries: string[] = [];
    for (const [stage, content] of stages) {
      if (content !== null) {
        const oid = (await plumbing(repository.root(), ['hash-object', '-w', '--stdin'], content)).stdout.trim();
        entries.push(`100644 ${oid} ${stage}\t${path}`);
      }
    }
    await plumbing(repository.root(), ['update-index', '-z', '--index-info'], entries.join('\0') + '\0');
  };

  const unmergedPaths = async (repository: SdkRepositoryContext) =>
    (await plumbing(repository.root(), ['ls-files', '-u'])).stdout.split('\n').filter((line) => line !== '');

  beforeEach(() => {
    root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-repository-')));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('SdkContext.repository', () => {
    it('finds nothing outside a repository', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk', 'typescript'));
      fs.mkdirSync(sdk.toString(), { recursive: true });

      expect(await contextFor(sdk).repository()).to.be.undefined;
    });

    it('answers for an SDK directory that is not there yet, from its nearest existing ancestor', async () => {
      const projectDirectory = new DirectoryPath(path.join(root, 'project'));
      fs.mkdirSync(projectDirectory.toString());
      await git.init(projectDirectory);

      const repository = (await contextFor(projectDirectory.join('sdk', 'typescript')).repository())!;

      expect(repository.root().isEqual(projectDirectory)).to.be.true;
      expect(repository.pristineRef().toString()).to.equal('refs/apimatic/pristine/sdk/typescript');
    });

    it('answers with the enclosing repository, however deep the SDK directory sits', async () => {
      const repository = await project(path.join('packages', 'sdk', 'typescript'));

      expect(repository.root().isEqual(new DirectoryPath(path.join(root, 'project')))).to.be.true;
      expect(repository.isRootSdk()).to.be.false;
      expect(repository.pristineRef().toString()).to.equal('refs/apimatic/pristine/packages/sdk/typescript');
    });
  });

  describe('SdkContext.initRepository', () => {
    it('creates the SDK directory when it is not there yet', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk', 'typescript'));

      const repository = (await contextFor(sdk).initRepository())._unsafeUnwrap();

      expect(repository.isRootSdk()).to.be.true;
      expect(fs.existsSync(path.join(sdk.toString(), '.git'))).to.be.true;
    });

    it('makes the SDK directory its own repository, on main, leaving its files alone', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk', 'typescript'));
      write(sdk, 'README.md', '# sdk');

      const repository = (await contextFor(sdk).initRepository())._unsafeUnwrap();

      expect(repository.isRootSdk()).to.be.true;
      expect(repository.pristineRef().toString()).to.equal('refs/apimatic/pristine');
      expect(fs.readFileSync(path.join(sdk.toString(), '.git', 'HEAD'), 'utf-8').trim()).to.equal(
        'ref: refs/heads/main'
      );
      expect(fs.readFileSync(path.join(sdk.toString(), 'README.md'), 'utf-8')).to.equal('# sdk');
    });
  });

  describe('recordPristine', () => {
    it('records the first snapshot with no parent, under the SDK directory’s ref', async () => {
      const repository = await project();

      const commit = (
        await record(repository, {
          'README.md': '# v1',
          'src/index.ts': 'export {};',
          '.gitignore': 'dist/\n',
          'dist/x.js': 'x'
        })
      )._unsafeUnwrap();

      expect((await git.resolveRef(repository.root(), repository.pristineRef()))?.isEqual(commit)).to.be.true;
      expect(await git.describe(repository.root(), commit)).to.deep.equal({
        parents: [],
        authorName: 'APIMatic CLI',
        subject: 'apimatic: pristine typescript v4 stable'
      });
      const files = await snapshotFiles(repository.root(), commit);
      expect([...files.keys()]).to.have.members(['README.md', 'src/index.ts', '.gitignore', 'dist/x.js']);
      expect(files.get('src/index.ts')).to.equal('export {};');
    });

    it('chains the next snapshot onto the last and moves the ref', async () => {
      const repository = await project();
      const first = (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();

      const second = (await record(repository, { 'README.md': '# v2' }))._unsafeUnwrap();

      expect((await git.describe(repository.root(), second)).parents).to.deep.equal([first]);
      expect((await git.resolveRef(repository.root(), repository.pristineRef()))?.isEqual(second)).to.be.true;
      expect((await snapshotFiles(repository.root(), first)).get('README.md')).to.equal('# v1');
    });

    it('keeps the last snapshot when the generation is identical, so the record names the same commit', async () => {
      const repository = await project();
      const first = (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();

      const again = (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();
      const changed = (await record(repository, { 'README.md': '# v2' }))._unsafeUnwrap();

      expect(again.isEqual(first)).to.be.true;
      expect((await git.describe(repository.root(), changed)).parents).to.deep.equal([first]);
    });

    it('refuses an SDK directory inside one that already has snapshots, and the reverse', async () => {
      const outer = await project();
      (await record(outer, { 'README.md': '# outer' }))._unsafeUnwrap();
      fs.mkdirSync(outer.sdkDirectory().join('typescript').toString());
      const inner = (await contextFor(outer.sdkDirectory().join('typescript')).repository())!;

      expect((await inner.inspect(TYPESCRIPT, undefined))._unsafeUnwrapErr()).to.deep.include({
        kind: 'nestedSdkDirectory',
        other: outer.sdkDirectory(),
        encloses: true
      });

      const other = await project(path.join('other', 'typescript', 'nested'));
      (await record(other, { 'README.md': '# nested' }))._unsafeUnwrap();
      const parent = (await contextFor(
        new DirectoryPath(path.join(root, 'project', 'other', 'typescript'))
      ).repository())!;
      expect((await parent.inspect(TYPESCRIPT, undefined))._unsafeUnwrapErr()).to.deep.include({
        kind: 'nestedSdkDirectory',
        other: other.sdkDirectory(),
        encloses: false
      });
    });

    it('refuses any SDK directory below a repository whose root is one', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk'));
      fs.mkdirSync(sdk.toString(), { recursive: true });
      const repository = (await contextFor(sdk).initRepository())._unsafeUnwrap();
      (await record(repository, { 'README.md': '# root' }))._unsafeUnwrap();
      expect(await git.resolveRef(sdk, SnapshotRef.pristine(''))).to.not.be.undefined;
      fs.mkdirSync(sdk.join('typescript').toString());
      const below = (await contextFor(sdk.join('typescript')).repository())!;

      expect((await below.inspect(TYPESCRIPT, undefined))._unsafeUnwrapErr()).to.deep.include({
        kind: 'nestedSdkDirectory',
        other: sdk,
        encloses: true
      });
    });
  });

  describe('savePrevious', () => {
    it('keeps the directory as it is, without its own .git, and replaces the last one', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk', 'typescript'));
      write(sdk, 'README.md', '# edited');
      write(sdk, path.join('.apimatic', 'generation.json'), '{}');
      const repository = (await contextFor(sdk).initRepository())._unsafeUnwrap();

      const first = (await repository.savePrevious(undefined))._unsafeUnwrap();
      write(sdk, 'README.md', '# edited again');
      const second = (await repository.savePrevious(undefined))._unsafeUnwrap();

      const kept = await snapshotFiles(sdk, second);
      expect([...kept.keys()]).to.have.members(['README.md', '.apimatic/generation.json']);
      expect(kept.get('README.md')).to.equal('# edited again');
      expect((await git.resolveRef(sdk, repository.previousRef()))?.isEqual(second)).to.be.true;
      expect((await git.describe(sdk, second)).parents).to.be.empty;
      expect((await snapshotFiles(sdk, first)).get('README.md')).to.equal('# edited');
    });

    it('includes a generated file the SDK’s own .gitignore matches, and leaves other ignored files out', async () => {
      const repository = await project();
      const base = (
        await record(repository, { '.gitignore': 'dist/\n', 'dist/generated.js': 'generated' })
      )._unsafeUnwrap();
      const sdk = repository.sdkDirectory();
      write(sdk, '.gitignore', 'dist/\n');
      write(sdk, 'dist/generated.js', 'generated');
      write(sdk, 'dist/built.js', 'built');

      const previous = (await repository.savePrevious(base))._unsafeUnwrap();

      expect([...(await snapshotFiles(repository.root(), previous)).keys()]).to.have.members([
        '.gitignore',
        'dist/generated.js'
      ]);
    });
  });

  describe('settling what the last run left unresolved', () => {
    const MARKERS = '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n';
    const ASKED = ['marked.ts', 'by-hand.ts', 'dropped.ts', 'deleted-by-you.ts', 'logo.png', 'gone.ts'].map(rel);

    const read = (repository: SdkRepositoryContext, relative: string) =>
      fs.readFileSync(repository.sdkDirectory().join(relative).toString(), 'utf8');
    const exists = (repository: SdkRepositoryContext, relative: string) =>
      fs.existsSync(repository.sdkDirectory().join(relative).toString());

    /** One unresolved file of each shape, and a marked file that git does not hold as unmerged. */
    const leftUnresolved = async () => {
      const repository = await project();
      const sdk = repository.sdkDirectory();
      write(sdk, 'marked.ts', 'top\n' + MARKERS + 'bottom\n');
      write(sdk, 'by-hand.ts', 'resolved by hand, not staged');
      write(sdk, 'dropped.ts', 'your edited file');
      write(sdk, 'deleted-by-you.ts', 'generated version');
      write(sdk, 'logo.png', 'yours\0binary');
      write(sdk, 'not-asked.ts', 'still ' + MARKERS);
      await unmerged(repository, 'sdk/typescript/marked.ts');
      await unmerged(repository, 'sdk/typescript/by-hand.ts');
      await unmerged(repository, 'sdk/typescript/dropped.ts', { yours: 'your edited file', generated: null });
      await unmerged(repository, 'sdk/typescript/deleted-by-you.ts', { yours: null, generated: 'generated version' });
      await unmerged(repository, 'sdk/typescript/logo.png', { yours: 'yours\0binary', generated: 'generated\0binary' });
      await unmerged(repository, 'sdk/typescript/gone.ts');
      return repository;
    };

    it('settles each file for the generator, keeps what was resolved by hand, and leaves the unmerged state', async () => {
      const repository = await leftUnresolved();

      (await repository.settleUnresolved('generated', ASKED))._unsafeUnwrap();

      expect(read(repository, 'marked.ts')).to.equal('top\ntheirs\nbottom\n');
      expect(read(repository, 'by-hand.ts')).to.equal('resolved by hand, not staged');
      expect(exists(repository, 'dropped.ts')).to.be.false;
      expect(read(repository, 'deleted-by-you.ts')).to.equal('generated version');
      expect(read(repository, 'logo.png')).to.equal('generated\0binary');
      expect(exists(repository, 'gone.ts')).to.be.false;
      expect(read(repository, 'not-asked.ts')).to.equal('still ' + MARKERS);
      expect(await unmergedPaths(repository)).to.deep.equal([]);
    });

    it('settles each file for you, keeps what was resolved by hand, and leaves the unmerged state', async () => {
      const repository = await leftUnresolved();

      (await repository.settleUnresolved('yours', ASKED))._unsafeUnwrap();

      expect(read(repository, 'marked.ts')).to.equal('top\nmine\nbottom\n');
      expect(read(repository, 'by-hand.ts')).to.equal('resolved by hand, not staged');
      expect(read(repository, 'dropped.ts')).to.equal('your edited file');
      expect(exists(repository, 'deleted-by-you.ts')).to.be.false;
      expect(read(repository, 'logo.png')).to.equal('yours\0binary');
      expect(exists(repository, 'gone.ts')).to.be.false;
      expect(await unmergedPaths(repository)).to.deep.equal([]);
    });
  });

  describe('the generation record', () => {
    it('is absent until written, then reads back what was written', async () => {
      const repository = await project();
      expect(await repository.readRecord()).to.be.undefined;
      const tree = (await repository.snapshotGenerated(generated({ 'README.md': '# v1' })))._unsafeUnwrap();

      const recorded = (await repository.recordGeneration(tree, TYPESCRIPT, '2.3.0'))._unsafeUnwrap();

      expect(fs.existsSync(path.join(repository.sdkDirectory().toString(), '.apimatic', 'generation.json'))).to.be.true;
      const read = (await repository.readRecord())!;
      expect(read.toJson()).to.equal(recorded.toJson());
      expect(read.isFor(TYPESCRIPT)).to.be.true;
      expect((await git.resolveRef(repository.root(), repository.pristineRef()))?.isEqual(read.pristineCommit())).to.be
        .true;
    });

    it('reads as absent when the file cannot be understood', async () => {
      const repository = await project();
      write(repository.sdkDirectory(), path.join('.apimatic', 'generation.json'), '{"schemaVersion": 2}');

      expect(await repository.readRecord()).to.be.undefined;
    });
  });

  describe('inspect', () => {
    it('finds no record', async () => {
      const repository = await project();

      expect((await repository.inspect(TYPESCRIPT, undefined))._unsafeUnwrap()).to.deep.equal({ kind: 'noRecord' });
    });

    it('finds a record for another generation', async () => {
      const repository = await project();
      const pristine = (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();
      await writeRecord(
        repository,
        GenerationRecord.written({ ...TYPESCRIPT, stability: Stability.BETA }, pristine, new Date(), '2.3.0')
      );

      const state = (await repository.inspect(TYPESCRIPT, undefined))._unsafeUnwrap();

      expect(state.kind).to.equal('otherGeneration');
      expect(state.kind === 'otherGeneration' && state.recorded.stability).to.equal(Stability.BETA);
    });

    it('finds a record whose snapshot the repository does not hold', async () => {
      const repository = await project();
      const missing = CommitId.create('f'.repeat(40))!;
      await writeRecord(repository, GenerationRecord.written(TYPESCRIPT, missing, new Date(), '2.3.0'));

      const state = (await repository.inspect(TYPESCRIPT, undefined))._unsafeUnwrap();

      expect(state.kind).to.equal('snapshotMissing');
    });

    it('names the files git holds as unmerged below the SDK directory, whatever they hold, and no other', async () => {
      const repository = await project();
      const sdk = repository.sdkDirectory();
      const pristine = (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();
      await writeRecord(repository, GenerationRecord.written(TYPESCRIPT, pristine, new Date(), '2.3.0'));
      write(sdk, 'src/a.ts', 'one\n<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n');
      write(sdk, 'src/b.ts', 'resolved but not staged\n');
      write(sdk, 'src/c.ts', '<<<<<<< Your changes\nstaged with markers in it\n>>>>>>> Generated by APIMatic\n');
      await unmerged(repository, 'sdk/typescript/src/a.ts');
      await unmerged(repository, 'sdk/typescript/src/b.ts');
      await unmerged(repository, 'sdk/typescript/src/gone.ts');
      await unmerged(repository, 'elsewhere/x.ts');

      const state = (await repository.inspect(TYPESCRIPT, undefined))._unsafeUnwrap();

      expect(state).to.include({ kind: 'unresolved' });
      expect(state.kind === 'unresolved' && state.paths.map(String)).to.deep.equal([
        'src/a.ts',
        'src/b.ts',
        'src/gone.ts'
      ]);
    });

    it('is ready to merge against the recorded snapshot once every file is staged, markers or not', async () => {
      const repository = await project();
      const pristine = (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();
      await writeRecord(repository, GenerationRecord.written(TYPESCRIPT, pristine, new Date(), '2.3.0'));
      write(
        repository.sdkDirectory(),
        'src/a.ts',
        '<<<<<<< Your changes\nstaged as is\n>>>>>>> Generated by APIMatic\n'
      );
      await plumbing(repository.root(), ['add', '--', 'sdk/typescript/src/a.ts']);

      const state = (await repository.inspect(TYPESCRIPT, undefined))._unsafeUnwrap();

      expect(state.kind).to.equal('ready');
      expect(state.kind === 'ready' && state.base.isEqual(pristine)).to.be.true;
    });

    it('refuses an SDK directory nested in one that has snapshots', async () => {
      const outer = await project();
      (await record(outer, { 'README.md': '# outer' }))._unsafeUnwrap();
      const inner = (await contextFor(outer.sdkDirectory().join('typescript')).repository())!;

      expect((await inner.inspect(TYPESCRIPT, undefined))._unsafeUnwrapErr().kind).to.equal('nestedSdkDirectory');
    });
  });

  describe('sharing', () => {
    const sh = (cwd: DirectoryPath | string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: cwd.toString() });

    const withOrigin = async (): Promise<{ repository: SdkRepositoryContext; origin: DirectoryPath }> => {
      const origin = new DirectoryPath(path.join(root, 'origin.git'));
      await sh(root, 'init', '-q', '--bare', '--initial-branch=main', origin.toString());
      const repository = await project();
      await sh(repository.root(), 'remote', 'add', 'origin', origin.toString());
      return { repository, origin };
    };

    /** A recorded generation, committed and pushed on `main`, as a developer leaves a project for a teammate. */
    const published = async (repository: SdkRepositoryContext) => {
      const tree = (await repository.snapshotGenerated(generated({ 'README.md': '# v1' })))._unsafeUnwrap();
      const record = (await repository.recordGeneration(tree, TYPESCRIPT, '0.0.0'))._unsafeUnwrap();
      await sh(repository.root(), 'add', '.');
      await sh(repository.root(), 'commit', '-qm', 'sdk');
      await sh(repository.root(), 'push', '-q', 'origin', 'main');
      return record.pristineCommit();
    };

    const cloneOf = async (origin: DirectoryPath, name: string): Promise<SdkRepositoryContext> => {
      const clone = new DirectoryPath(path.join(root, name));
      await sh(root, 'clone', '-q', '--no-local', origin.toString(), clone.toString());
      return (await contextFor(clone.join('sdk', 'typescript')).repository())!;
    };

    it('lets a clone merge against a snapshot it fetched', async () => {
      const { repository, origin } = await withOrigin();
      const base = await published(repository);
      const clone = await cloneOf(origin, 'clone');
      const before = (await clone.inspect(TYPESCRIPT, 'origin'))._unsafeUnwrap();
      expect(before).to.deep.include({ kind: 'snapshotMissing', fetch: { kind: 'absent', remote: 'origin' } });

      await sh(repository.root(), 'push', '-q', 'origin', repository.pristineRef().refspec());
      const after = (await clone.inspect(TYPESCRIPT, 'origin'))._unsafeUnwrap();

      expect(after.kind === 'ready' && after.base.isEqual(base)).to.be.true;
      expect((await git.resolveRef(clone.root(), clone.pristineRef()))?.isEqual(base)).to.be.true;
    });

    it('reports a remote it cannot reach, and no remote at all', async () => {
      const { repository, origin } = await withOrigin();
      await published(repository);
      const clone = await cloneOf(origin, 'clone');
      fs.rmSync(origin.toString(), { recursive: true, force: true });

      const unreachable = (await clone.inspect(TYPESCRIPT, 'origin'))._unsafeUnwrap();
      const none = (await clone.inspect(TYPESCRIPT, undefined))._unsafeUnwrap();

      expect(unreachable.kind === 'snapshotMissing' && unreachable.fetch).to.include({
        kind: 'failed',
        remote: 'origin'
      });
      expect(none.kind === 'snapshotMissing' && none.fetch).to.deep.equal({ kind: 'noRemote' });
    });

    it('joins its own chain with the remote’s while fetching a snapshot it lacks', async () => {
      const { repository: a, origin } = await withOrigin();
      const first = (await record(a, { 'README.md': '# a' }))._unsafeUnwrap();
      await sh(a.root(), 'push', '-q', 'origin', a.pristineRef().refspec());
      const bRoot = new DirectoryPath(path.join(root, 'b'));
      fs.mkdirSync(bRoot.join('sdk', 'typescript').toString(), { recursive: true });
      await git.init(bRoot);
      await sh(bRoot, 'remote', 'add', 'origin', origin.toString());
      const b = (await contextFor(bRoot.join('sdk', 'typescript')).repository())!;
      const second = (await record(b, { 'README.md': '# b' }))._unsafeUnwrap();
      await writeRecord(b, GenerationRecord.written(TYPESCRIPT, first, new Date(), '0.0.0'));

      const state = (await b.inspect(TYPESCRIPT, 'origin'))._unsafeUnwrap();

      expect(state.kind === 'ready' && state.base.isEqual(first)).to.be.true;
      const tip = (await git.resolveRef(bRoot, b.pristineRef()))!;
      expect((await git.describe(bRoot, tip)).parents.map(String)).to.have.members([
        second.toString(),
        first.toString()
      ]);
    });
  });

  describe('the hook that shares snapshots', () => {
    const sh = (cwd: DirectoryPath | string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: cwd.toString() });

    const hookFile = (repository: SdkRepositoryContext, name = 'pre-push') =>
      path.join(repository.root().toString(), '.git', 'hooks', name);

    /**
     * A project with a bare origin, one recorded snapshot, the hook installed, and `main` committed.
     * `sdk` is the SDK directory below the project, empty for the project's root; `origin` is one
     * another project already pushes to.
     */
    const ready = async (
      name = 'project',
      { sdk = ['sdk', 'typescript'], origin: shared }: { sdk?: string[]; origin?: DirectoryPath } = {}
    ) => {
      const origin = shared ?? new DirectoryPath(path.join(root, `${name}-origin.git`));
      if (shared === undefined) {
        await sh(root, 'init', '-q', '--bare', '--initial-branch=main', origin.toString());
      }
      const projectDirectory = new DirectoryPath(path.join(root, name));
      fs.mkdirSync(projectDirectory.join(...sdk).toString(), { recursive: true });
      await git.init(projectDirectory);
      await sh(projectDirectory, 'remote', 'add', 'origin', origin.toString());
      const repository = (await contextFor(projectDirectory.join(...sdk)).repository())!;
      const commit = (await record(repository, { 'README.md': `# ${name}` }))._unsafeUnwrap();
      (await repository.installShareHook())._unsafeUnwrap();
      write(projectDirectory, 'README.md', `# ${name}`);
      await sh(projectDirectory, 'add', '.');
      await sh(projectDirectory, 'commit', '-qm', 'sdk');
      return { repository, origin, commit };
    };

    it('writes the script and a hook that calls it into .git/hooks, once', async () => {
      const repository = await project();

      const first = (await repository.installShareHook())._unsafeUnwrap();
      const second = (await repository.installShareHook())._unsafeUnwrap();

      expect(first.kind === 'installed' && first.file.toString()).to.equal(hookFile(repository));
      expect(second).to.deep.equal(first);
      expect(fs.readFileSync(hookFile(repository, 'apimatic-pre-push'), 'utf8')).to.equal(SHARE_HOOK_SCRIPT);
      const hook = fs.readFileSync(hookFile(repository), 'utf8');
      expect(hook.split(SHARE_HOOK_BLOCK)).to.have.length(2);
      if (process.platform !== 'win32') {
        expect(fs.statSync(hookFile(repository)).mode & 0o111).to.not.equal(0);
        expect(fs.statSync(hookFile(repository, 'apimatic-pre-push')).mode & 0o111).to.not.equal(0);
      }
    });

    it('names the one line to add where git runs hooks from elsewhere, husky’s layout included', async () => {
      const repository = await project();
      const script = hookFile(repository, 'apimatic-pre-push');
      await sh(repository.root(), 'config', 'core.hooksPath', '.githooks');

      const plain = (await repository.installShareHook())._unsafeUnwrap();

      expect(plain.kind === 'elsewhere' && plain.hooksPath).to.equal('.githooks');
      expect(plain.kind === 'elsewhere' && plain.file.toString()).to.equal(
        path.join(repository.root().toString(), '.githooks', 'pre-push')
      );
      expect(plain.kind === 'elsewhere' && plain.script.toString()).to.equal(script);
      expect(fs.existsSync(script)).to.be.true;
      expect(fs.existsSync(hookFile(repository))).to.be.false;

      await sh(repository.root(), 'config', 'core.hooksPath', '.husky/_');
      const husky = (await repository.installShareHook())._unsafeUnwrap();

      expect(husky.kind === 'elsewhere' && husky.file.toString()).to.equal(
        path.join(repository.root().toString(), '.husky', 'pre-push')
      );
    });

    it('is quiet once the hook elsewhere runs the script', async () => {
      const repository = await project();
      await sh(repository.root(), 'config', 'core.hooksPath', '.husky/_');
      write(repository.root(), path.join('.husky', 'pre-push'), `npm test\n${SHARE_HOOK_CALL}\n`);

      const result = (await repository.installShareHook())._unsafeUnwrap();

      expect(result.kind).to.equal('installed');
      expect(result.kind === 'installed' && result.file.toString()).to.equal(
        path.join(repository.root().toString(), '.husky', 'pre-push')
      );
    });

    it('leaves a hook in another language alone, naming it, unless it runs the script already', async () => {
      const repository = await project();
      fs.mkdirSync(path.dirname(hookFile(repository)), { recursive: true });
      fs.writeFileSync(hookFile(repository), '#!/usr/bin/env node\nconsole.log("hi");\n');

      const result = (await repository.installShareHook())._unsafeUnwrap();

      expect(result.kind === 'notShell' && result.shebang).to.equal('#!/usr/bin/env node');
      expect(fs.readFileSync(hookFile(repository), 'utf8')).to.not.contain(SHARE_HOOK_BLOCK);

      fs.writeFileSync(
        hookFile(repository),
        '#!/usr/bin/env node\nrequire("child_process").execSync("sh .git/hooks/apimatic-pre-push");\n'
      );
      expect((await repository.installShareHook())._unsafeUnwrap().kind).to.equal('installed');
    });

    it('shares the chain when the developer pushes a branch, and is quiet about it', async () => {
      const { repository, origin, commit } = await ready();

      const pushed = await sh(repository.root(), 'push', '-q', 'origin', 'main');

      expect(pushed.stderr).to.not.contain('apimatic');
      expect((await git.resolveRef(origin, repository.pristineRef()))?.isEqual(commit)).to.be.true;
    });

    it('shares the chain of an SDK at the repository root, whose ref has no directory of its own', async () => {
      const { repository, origin, commit } = await ready('typescript', { sdk: [] });

      await sh(repository.root(), 'push', '-q', 'origin', 'main');

      expect(repository.pristineRef().toString()).to.equal('refs/apimatic/pristine');
      expect((await git.resolveRef(origin, repository.pristineRef()))?.isEqual(commit)).to.be.true;
    });

    it('shares through husky’s hook too, once it has the line', async () => {
      const { repository, origin, commit } = await ready();
      fs.rmSync(hookFile(repository));
      await sh(repository.root(), 'config', 'core.hooksPath', '.husky/_');
      write(repository.root(), path.join('.husky', '_', 'pre-push'), '#!/bin/sh\n. "$(dirname "$0")/../pre-push"\n');
      fs.chmodSync(path.join(repository.root().toString(), '.husky', '_', 'pre-push'), 0o755);
      write(repository.root(), path.join('.husky', 'pre-push'), `set -e\n${SHARE_HOOK_CALL}\necho "husky ran" >&2\n`);

      const pushed = await sh(repository.root(), 'push', '-q', 'origin', 'main');

      expect(pushed.stderr).to.contain('husky ran');
      expect(pushed.stderr).to.not.contain('apimatic');
      expect((await git.resolveRef(origin, repository.pristineRef()))?.isEqual(commit)).to.be.true;
    });

    it('does not fail a push from a clone that never ran the CLI', async () => {
      const { repository, origin } = await ready();
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
      expect(repository).to.not.be.undefined;
    });

    it('joins a chain another machine pushed meanwhile, at push time', async () => {
      const a = await ready('a');
      await sh(a.repository.root(), 'push', '-q', 'origin', 'main');
      const b = await ready('b', { origin: a.origin });

      const pushed = await sh(b.repository.root(), 'push', '-q', 'origin', 'HEAD:refs/heads/b');

      expect(pushed.stderr).to.not.contain('apimatic');
      const tip = (await git.resolveRef(a.origin, b.repository.pristineRef()))!;
      expect((await git.describe(a.origin, tip)).subject).to.equal('apimatic: pristine chains joined');
      expect((await git.describe(a.origin, tip)).parents.map(String)).to.have.members([
        b.commit.toString(),
        a.commit.toString()
      ]);
    });

    it('joins the chain of an SDK at the repository root too', async () => {
      const a = await ready('a', { sdk: [] });
      await sh(a.repository.root(), 'push', '-q', 'origin', 'main');
      const b = await ready('b', { sdk: [], origin: a.origin });

      await sh(b.repository.root(), 'push', '-q', 'origin', 'HEAD:refs/heads/b');

      const tip = (await git.resolveRef(a.origin, b.repository.pristineRef()))!;
      expect((await git.describe(a.origin, tip)).parents.map(String)).to.have.members([
        b.commit.toString(),
        a.commit.toString()
      ]);
    });

    it('warns in the server’s words when the remote refuses the ref, and the branch still lands', async () => {
      const { repository, origin } = await ready();
      fs.writeFileSync(
        path.join(origin.toString(), 'hooks', 'pre-receive'),
        '#!/bin/sh\nwhile read old new ref; do case "$ref" in refs/apimatic/*) echo "snapshots are not accepted here"; exit 1;; esac; done; exit 0\n',
        { mode: 0o755 }
      );

      const pushed = await sh(repository.root(), 'push', '-q', 'origin', 'main');

      expect(pushed.stderr).to.contain(
        'apimatic: the SDK snapshots could not be pushed to origin: snapshots are not accepted here'
      );
      expect(await git.resolveRef(origin, repository.pristineRef())).to.be.undefined;
      expect((await sh(origin, 'rev-parse', '--verify', 'refs/heads/main')).exitCode).to.equal(0);
    });

    it('runs ahead of a hook that was already there, which still runs', async () => {
      const { repository, origin, commit } = await ready();
      fs.writeFileSync(hookFile(repository), '#!/bin/sh\necho "existing hook ran" >&2\nexit 0\n');
      (await repository.installShareHook())._unsafeUnwrap();

      const pushed = await sh(repository.root(), 'push', '-q', 'origin', 'main');

      expect(pushed.stderr.match(/existing hook ran/g)).to.have.length(1);
      expect((await git.resolveRef(origin, repository.pristineRef()))?.isEqual(commit)).to.be.true;
    });
  });
});
