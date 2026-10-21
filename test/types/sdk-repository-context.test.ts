import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { GitService } from '../../src/infrastructure/git-service.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../src/types/file/relativeFilePath.js';
import { SdkContext } from '../../src/types/sdk-context.js';
import { SdkRepositoryContext } from '../../src/types/sdk-repository-context.js';
import { CommitId } from '../../src/types/sdk/commit-id.js';
import { CodeGenerationVersion, Language, Stability } from '../../src/types/sdk/generate.js';
import { GenerationRecord, SdkGeneration } from '../../src/types/sdk/generation-record.js';
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

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-repository-'));
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

      expect((await record(inner, { 'README.md': '# inner' }))._unsafeUnwrapErr().kind).to.equal('nestedSdkDirectory');

      const other = await project(path.join('other', 'typescript', 'nested'));
      (await record(other, { 'README.md': '# nested' }))._unsafeUnwrap();
      const parent = (await contextFor(
        new DirectoryPath(path.join(root, 'project', 'other', 'typescript'))
      ).repository())!;
      expect((await record(parent, {}))._unsafeUnwrapErr().kind).to.equal('nestedSdkDirectory');
    });

    it('refuses any SDK directory below a repository whose root is one', async () => {
      const sdk = new DirectoryPath(path.join(root, 'sdk'));
      fs.mkdirSync(sdk.toString(), { recursive: true });
      const repository = (await contextFor(sdk).initRepository())._unsafeUnwrap();
      (await record(repository, { 'README.md': '# root' }))._unsafeUnwrap();
      expect(await git.resolveRef(sdk, SnapshotRef.pristine(''))).to.not.be.undefined;
      fs.mkdirSync(sdk.join('typescript').toString());
      const below = (await contextFor(sdk.join('typescript')).repository())!;

      expect((await record(below, {}))._unsafeUnwrapErr().kind).to.equal('nestedSdkDirectory');
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

  describe('the generation record', () => {
    it('is absent until written, then reads back what was written', async () => {
      const repository = await project();
      expect(await repository.readRecord()).to.be.undefined;
      const tree = (await repository.snapshotGenerated(generated({ 'README.md': '# v1' })))._unsafeUnwrap();

      const recorded = (
        await repository.recordGeneration(tree, TYPESCRIPT, '2.3.0', ['src/index.ts'].map(rel))
      )._unsafeUnwrap();

      expect(fs.existsSync(path.join(repository.sdkDirectory().toString(), '.apimatic', 'generation.json'))).to.be.true;
      const read = (await repository.readRecord())!;
      expect(read.toJson()).to.equal(recorded.toJson());
      expect(read.conflictedPaths().map(String)).to.deep.equal(['src/index.ts']);
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
    const MARKED = 'one\n<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n';

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
      expect(state.kind === 'snapshotMissing' && state.commit.isEqual(missing)).to.be.true;
    });

    it('names the listed files that still hold conflict markers, and not the resolved or removed ones', async () => {
      const repository = await project();
      const sdk = repository.sdkDirectory();
      const pristine = (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();
      await writeRecord(
        repository,
        GenerationRecord.written(
          TYPESCRIPT,
          pristine,
          new Date(),
          '2.3.0',
          ['src/a.ts', 'src/b.ts', 'src/gone.ts'].map(rel)
        )
      );
      write(sdk, 'src/a.ts', MARKED);
      write(sdk, 'src/b.ts', 'resolved\n');

      const state = (await repository.inspect(TYPESCRIPT, undefined))._unsafeUnwrap();

      expect(state).to.include({ kind: 'unresolved' });
      expect(state.kind === 'unresolved' && state.paths.map(String)).to.deep.equal(['src/a.ts']);
    });

    it('is ready to merge against the recorded snapshot once the markers are gone', async () => {
      const repository = await project();
      const pristine = (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();
      await writeRecord(
        repository,
        GenerationRecord.written(TYPESCRIPT, pristine, new Date(), '2.3.0', ['src/a.ts'].map(rel))
      );
      write(repository.sdkDirectory(), 'src/a.ts', 'resolved\n');

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
      await sh(root, 'init', '-q', '--bare', origin.toString());
      const repository = await project();
      await sh(repository.root(), 'remote', 'add', 'origin', origin.toString());
      return { repository, origin };
    };

    /** A recorded generation, committed and pushed on `main`, as a developer leaves a project for a teammate. */
    const published = async (repository: SdkRepositoryContext) => {
      const tree = (await repository.snapshotGenerated(generated({ 'README.md': '# v1' })))._unsafeUnwrap();
      const record = (await repository.recordGeneration(tree, TYPESCRIPT, '0.0.0', []))._unsafeUnwrap();
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

    it('pushes the chain, then finds it already there', async () => {
      const { repository, origin } = await withOrigin();
      const commit = (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();

      expect((await repository.shareSnapshot('origin'))._unsafeUnwrap()).to.equal('pushed');
      expect((await repository.shareSnapshot('origin'))._unsafeUnwrap()).to.equal('upToDate');

      expect((await git.resolveRef(origin, repository.pristineRef()))?.isEqual(commit)).to.be.true;
    });

    it('lets a clone merge against a snapshot it fetched, and says where from', async () => {
      const { repository, origin } = await withOrigin();
      const base = await published(repository);
      const clone = await cloneOf(origin, 'clone');
      const before = (await clone.inspect(TYPESCRIPT, 'origin'))._unsafeUnwrap();
      expect(before).to.deep.include({ kind: 'snapshotMissing', fetch: { kind: 'absent', remote: 'origin' } });

      (await repository.shareSnapshot('origin'))._unsafeUnwrap();
      const after = (await clone.inspect(TYPESCRIPT, 'origin'))._unsafeUnwrap();

      expect(after.kind === 'ready' && after.base.isEqual(base) && after.fetchedFrom).to.equal('origin');
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

    it('joins two chains that diverged, so both machines’ snapshots reach the remote', async () => {
      const { repository: a, origin } = await withOrigin();
      const first = (await record(a, { 'README.md': '# a' }))._unsafeUnwrap();
      (await a.shareSnapshot('origin'))._unsafeUnwrap();
      const bRoot = new DirectoryPath(path.join(root, 'b'));
      fs.mkdirSync(bRoot.join('sdk', 'typescript').toString(), { recursive: true });
      await git.init(bRoot);
      await sh(bRoot, 'remote', 'add', 'origin', origin.toString());
      const b = (await contextFor(bRoot.join('sdk', 'typescript')).repository())!;
      const second = (await record(b, { 'README.md': '# b' }))._unsafeUnwrap();

      expect((await b.shareSnapshot('origin'))._unsafeUnwrap()).to.equal('joined');

      const tip = (await git.resolveRef(origin, b.pristineRef()))!;
      expect((await git.describe(origin, tip)).parents.map(String)).to.have.members([
        second.toString(),
        first.toString()
      ]);
      expect((await git.describe(origin, tip)).subject).to.equal('apimatic: pristine chains joined');
    });

    it('reports a push the remote refuses, with its reason', async () => {
      const { repository, origin } = await withOrigin();
      fs.writeFileSync(
        path.join(origin.toString(), 'hooks', 'pre-receive'),
        '#!/bin/sh\necho "snapshots are not accepted here"\nexit 1\n',
        { mode: 0o755 }
      );
      (await record(repository, { 'README.md': '# v1' }))._unsafeUnwrap();

      const shared = await repository.shareSnapshot('origin');

      expect(shared._unsafeUnwrapErr().reason).to.contain('snapshots are not accepted here');
      expect(shared._unsafeUnwrapErr().reason).to.not.contain('failed to push some refs');
    });
  });
});
