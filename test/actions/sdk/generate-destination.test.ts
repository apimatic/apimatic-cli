import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { canonical } from '../../../src/infrastructure/tmp-extensions.js';
import { execa } from 'execa';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import { GenerateAction } from '../../../src/actions/sdk/generate.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
import { RemoteName } from '../../../src/types/git/remote-name.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, SdkGeneration } from '../../../src/types/sdk/generation-record.js';
import { SdkPath } from '../../../src/types/sdk/sdk-path.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';
import { SdkRepositoryContext } from '../../../src/types/sdk-repository-context.js';
import { terminal } from '../../../src/infrastructure/terminal.js';
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';
import { repositoryOf } from '../../helpers/snapshots.js';

/** A ref onto itself, as `git push` and `git fetch` take it. */
const refspec = (ref: SnapshotRef): string => `${ref}:${ref}`;

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };
const STABLE: SdkGeneration = {
  language: Language.PYTHON,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
};
const GENERATED: Files = { 'README.md': '# sdk' };

/** How the SDK directory is written: decided before the upload, from git and what the directory holds. */
describe('GenerateAction (sdk) — the destination', () => {
  let root: string;
  let project: string;
  let generates: (files: Files) => Promise<void>;
  let generateSdk: sinon.SinonStub;
  const git = new GitService();

  const sdk = () => new DirectoryPath(path.join(project, 'sdk', 'python'));
  const at = (relative: string) => path.join(sdk().toString(), relative);
  const read = (relative: string) => fs.readFileSync(at(relative), 'utf8');
  const write = (relative: string, contents: string) => writeFiles(sdk().toString(), { [relative]: contents });
  const record = () => GenerationRecord.parse(read('.apimatic/generation.json'))!;
  /** What a developer sees after a merge: the generator's change landed in the edited directory, and the run said so. */
  const V2: Files = { 'README.md': '# sdk v2' };
  const merged = () =>
    read('README.md') === '# sdk v2' && (SdkGeneratePrompts.prototype.sdkMerged as sinon.SinonStub).calledOnce;

  const execute = async (
    options: { force?: boolean; stability?: Stability; files?: Files; destination?: DirectoryPath } = {}
  ) => {
    await generates(options.files ?? GENERATED);
    return new GenerateAction(new DirectoryPath(project), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(project)),
      options.destination ?? sdk(),
      Language.PYTHON,
      options.stability ?? Stability.STABLE,
      options.force ?? true
    );
  };

  /** A recorded generation of `files`, so the directory has a base. */
  const recorded = async (files: Files): Promise<SdkRepositoryContext> => {
    writeFiles(sdk().toString(), files);
    (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
    const repository = (await repositoryOf(sdk(), STABLE))!;
    const tree = (await repository.snapshotGenerated(sdk()))._unsafeUnwrap();
    (await repository.record(tree, STABLE))._unsafeUnwrap();
    return repository;
  };

  /** Leaves `relative` (below the SDK directory) unmerged in the index, as a conflicted run does. */
  const unmerged = async (relative: string) => {
    const cwd = root;
    const oid = (await execa('git', ['hash-object', '-w', '--stdin'], { cwd, input: 'x' })).stdout.trim();
    const entries = [1, 2, 3].map((stage) => `100644 ${oid} ${stage}\tsdk/python/${relative}`).join('\0') + '\0';
    await execa('git', ['update-index', '-z', '--index-info'], { cwd, input: entries });
  };

  beforeEach(() => {
    root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-')));
    project = root;
    ({ generates, generateSdk } = stubSdkGeneration(root));
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryNotCreated');
    sinon.stub(SdkGeneratePrompts.prototype, 'shareHookInstalled');
  });

  /** A terminal run, where the questions can be asked. */
  const interactive = () => sinon.stub(terminal, 'isInteractive').returns(true);

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  for (const [found, output] of [
    ['no git', undefined],
    ['an older git', 'git version 2.30.2']
  ] as const) {
    it(`with ${found}, warns that customizations will not persist and overwrites`, async () => {
      sinon
        .stub(GitService.prototype, 'version')
        .resolves(ok(output === undefined ? undefined : GitVersion.parse(output)));
      const gitUnavailable = sinon.stub(SdkGeneratePrompts.prototype, 'gitUnavailable');

      expect((await execute()).isSuccess()).to.be.true;

      expect(gitUnavailable.firstCall.args[0]?.toString()).to.equal(output === undefined ? undefined : '2.30.2');
      expect(fs.readdirSync(sdk().toString())).to.deep.equal(['README.md']);
    });
  }

  describe('when nothing encloses the SDK directory', () => {
    it('asks, and on yes records into a repository of its own', async () => {
      interactive();
      const createRepository = sinon.stub(SdkGeneratePrompts.prototype, 'createRepository').resolves(true);

      expect((await execute({ force: false })).isSuccess()).to.be.true;

      expect(createRepository.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(fs.readFileSync(at('.git/HEAD'), 'utf-8').trim()).to.equal('ref: refs/heads/main');
      expect(record().isFor(STABLE)).to.be.true;
    });

    it('on no, writes the SDK without a repository and warns that edits will not persist', async () => {
      interactive();
      sinon.stub(SdkGeneratePrompts.prototype, 'createRepository').resolves(false);
      const notCreated = SdkGeneratePrompts.prototype.repositoryNotCreated as sinon.SinonStub;

      expect((await execute({ force: false })).isSuccess()).to.be.true;

      expect(notCreated.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(fs.readdirSync(sdk().toString())).to.deep.equal(['README.md']);
    });

    for (const [how, tty, force] of [
      ['with --force', true, true],
      ['without a terminal', false, false]
    ] as const) {
      it(`does not ask ${how}: no repository, the warning, exit 0`, async () => {
        sinon.stub(terminal, 'isInteractive').returns(tty);
        const createRepository = sinon.stub(SdkGeneratePrompts.prototype, 'createRepository');
        const notCreated = SdkGeneratePrompts.prototype.repositoryNotCreated as sinon.SinonStub;

        expect((await execute({ force })).isSuccess()).to.be.true;

        expect(createRepository.called).to.be.false;
        expect(notCreated.calledOnce).to.be.true;
        expect(fs.readdirSync(sdk().toString())).to.deep.equal(['README.md']);
      });
    }
  });

  it('records into the enclosing repository when the directory has no record', async () => {
    (await git.init(new DirectoryPath(root)))._unsafeUnwrap();

    expect((await execute()).isSuccess()).to.be.true;

    expect(fs.existsSync(at('.git'))).to.be.false;
    const ref = SnapshotRef.pristine(SdkPath.fromGit('sdk/python')!);
    expect((await git.resolveRef(new DirectoryPath(root), ref))._unsafeUnwrap()?.isEqual(record().pristineCommit())).to
      .be.true;
  });

  it('records over an SDK generated at another stability, after saying so and asking', async () => {
    await recorded({ 'README.md': '# sdk' });
    interactive();
    const notForThis = sinon.stub(SdkGeneratePrompts.prototype, 'recordNotForThisGeneration');
    sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(true);

    expect((await execute({ stability: Stability.BETA, force: false })).isSuccess()).to.be.true;

    expect(notForThis.firstCall.args[0]).to.deep.equal(STABLE);
    expect(notForThis.firstCall.args[1].stability).to.equal(Stability.BETA);
    expect(record().isFor(STABLE)).to.be.false;
  });

  it('records over an SDK whose snapshot the repository does not hold, after saying so and asking', async () => {
    await recorded({ 'README.md': '# sdk' });
    const missing = CommitId.fromGit('f'.repeat(40))!;
    write('.apimatic/generation.json', GenerationRecord.written(STABLE, missing).toJson());
    interactive();
    const snapshotMissing = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');
    sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(true);

    expect((await execute({ force: false })).isSuccess()).to.be.true;

    expect(snapshotMissing.firstCall.args[0]).to.deep.equal({ kind: 'noRemote' });
    expect(record().pristineCommit().isEqual(missing)).to.be.false;
  });

  for (const [what, prepare] of [
    ['another stability', async () => ({ stability: Stability.BETA })],
    [
      'a snapshot the repository does not hold',
      async () => {
        write(
          '.apimatic/generation.json',
          GenerationRecord.written(STABLE, CommitId.fromGit('f'.repeat(40))!).toJson()
        );
        return {};
      }
    ]
  ] as const) {
    it(`refuses, with --force, to replace an SDK recorded for ${what}, before anything is uploaded`, async () => {
      await recorded({ 'README.md': '# sdk' });
      write('README.md', '# edited');
      sinon.stub(SdkGeneratePrompts.prototype, 'recordNotForThisGeneration');
      sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');
      const notReplaced = sinon.stub(SdkGeneratePrompts.prototype, 'recordedSdkNotReplaced');
      const options = await prepare();

      const result = await execute({ ...options, force: true });

      expect(result.isFailed()).to.be.true;
      expect(notReplaced.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(generateSdk.called).to.be.false;
      expect(read('README.md')).to.equal('# edited');
    });
  }

  it('merges in a clone only once the pristine refs were fetched by hand, and says how', async () => {
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-remote-'));
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-clone-'));
    const sh = (cwd: string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd });
    try {
      await recorded({ 'README.md': '# sdk' });
      await sh(root, 'add', '.');
      await sh(root, 'commit', '-qm', 'sdk');
      await sh(root, 'init', '-q', '--bare', '--initial-branch=main', remote);
      await sh(root, 'remote', 'add', 'origin', remote);
      // Hooks skipped, as a tool that bypasses them pushes, so the clone starts without the snapshots.
      await sh(root, 'push', '-q', '--no-verify', 'origin', 'main');
      await sh(root, 'clone', '-q', '--no-local', remote, clone);
      project = clone;
      const snapshotMissing = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');
      sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
      sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');

      expect((await execute({ force: false })).isCancelled()).to.be.true;
      expect(snapshotMissing.firstCall.args[0]).to.deep.equal({ kind: 'absent', remote: RemoteName.origin() });
      expect(generateSdk.called).to.be.false;

      await sh(root, 'push', '-q', '--no-verify', 'origin', 'refs/apimatic/pristine/*:refs/apimatic/pristine/*');
      await sh(clone, 'fetch', '-q', 'origin', '+refs/apimatic/pristine/*:refs/apimatic/pristine/*');

      expect((await execute({ force: false, files: V2 })).isSuccess()).to.be.true;
      expect(merged()).to.be.true;
    } finally {
      fs.rmSync(remote, { recursive: true, force: true });
      fs.rmSync(clone, { recursive: true, force: true });
    }
  });

  it('merges against the recorded snapshot, without asking, when the record and its commit are there', async () => {
    await recorded({ 'README.md': '# sdk' });
    write('NOTES.md', '# mine');
    const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk');

    expect((await execute({ force: false, files: V2 })).isSuccess()).to.be.true;

    expect(overwriteSdk.called).to.be.false;
    expect(read('NOTES.md')).to.equal('# mine');
    expect(merged()).to.be.true;
  });

  it('refuses while git holds a file of the SDK as unmerged', async () => {
    await recorded({ 'README.md': '# sdk', 'a.py': 'x' });
    write('a.py', '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n');
    await unmerged('a.py');
    const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

    expect((await execute()).isFailed()).to.be.true;

    expect(conflictsUnresolved.firstCall.args[0].map(String)).to.deep.equal(['a.py']);
    expect(generateSdk.called).to.be.false;
  });

  it('refuses an unmerged file before looking at the record, so another stability or no record cannot write over it', async () => {
    await recorded({ 'README.md': '# sdk', 'a.py': 'x' });
    write('a.py', '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n');
    await unmerged('a.py');
    const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

    expect((await execute({ stability: Stability.BETA })).isFailed()).to.be.true;
    fs.rmSync(at('.apimatic'), { recursive: true });
    expect((await execute()).isFailed()).to.be.true;

    expect(conflictsUnresolved.callCount).to.equal(2);
    expect(read('a.py')).to.contain('<<<<<<< Your changes');
    expect(generateSdk.called).to.be.false;
  });

  describe('the question while the last run’s conflicts are unresolved', () => {
    const MARKED = '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n';
    const FILES: Files = { 'README.md': '# sdk', 'a.py': 'generated' };

    /** A recorded generation whose `a.py` the developer left unmerged with markers. */
    const marked = async () => {
      await recorded(FILES);
      write('a.py', 'kept above\n' + MARKED + 'kept below\n');
      write('b.py', 'resolved by hand');
      await unmerged('a.py');
      sinon.stub(terminal, 'isInteractive').returns(true);
    };

    it('settles the markers still there for the generator, keeping the rest of the file, then merges', async () => {
      await marked();
      sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves('generated');
      const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      expect((await execute({ force: false, files: { ...FILES, ...V2 } })).isSuccess()).to.be.true;

      expect(read('a.py')).to.equal('kept above\ntheirs\nkept below\n');
      expect(read('b.py')).to.equal('resolved by hand');
      expect(conflictsResolved.firstCall.args[0]).to.equal('generated');
      expect(conflictsResolved.firstCall.args[1].map(String)).to.deep.equal(['a.py']);
      expect(merged()).to.be.true;
    });

    it('settles the markers still there for you, keeping the rest of the file, then merges', async () => {
      await marked();
      sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves('yours');
      const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      expect((await execute({ force: false, files: { ...FILES, ...V2 } })).isSuccess()).to.be.true;

      expect(read('a.py')).to.equal('kept above\nmine\nkept below\n');
      expect(read('b.py')).to.equal('resolved by hand');
      expect(conflictsResolved.firstCall.args[0]).to.equal('yours');
      expect(merged()).to.be.true;
    });

    it('stops, touching nothing, when the developer will finish resolving or backs out', async () => {
      await marked();
      sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves(undefined);
      const resolveLater = sinon.stub(SdkGeneratePrompts.prototype, 'resolveLater');

      expect((await execute({ force: false, files: FILES })).isFailed()).to.be.true;

      expect(read('a.py')).to.equal('kept above\n' + MARKED + 'kept below\n');
      expect(resolveLater.calledOnce).to.be.true;
      expect(generateSdk.called).to.be.false;
    });

    for (const [how, tty, force] of [
      ['with --force', true, true],
      ['without a terminal', false, false]
    ] as const) {
      it(`does not ask ${how}`, async () => {
        await marked();
        (terminal.isInteractive as sinon.SinonStub).returns(tty);
        const unresolvedChoice = sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice');
        const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

        expect((await execute({ force, files: FILES })).isFailed()).to.be.true;

        expect(unresolvedChoice.called).to.be.false;
        expect(conflictsUnresolved.calledOnce).to.be.true;
      });
    }
  });

  it('refuses an SDK directory nested in one that has snapshots', async () => {
    await recorded({ 'README.md': '# sdk' });
    const notInspected = sinon.stub(SdkGeneratePrompts.prototype, 'directoryNotInspected');

    expect((await execute({ destination: sdk().join('python') })).isFailed()).to.be.true;

    const [where, problem] = notInspected.firstCall.args;
    expect(where.isEqual(sdk().join('python'))).to.be.true;
    const refused = 'kind' in problem && problem.kind === 'nestedSdkDirectory' ? problem : undefined;
    expect(refused?.other.isEqual(sdk())).to.be.true;
    expect(refused?.encloses).to.be.true;
    expect(generateSdk.called).to.be.false;
  });

  it('refuses while the repository is in the middle of a merge of the developer’s own', async () => {
    await recorded({ 'README.md': '# sdk' });
    fs.writeFileSync(path.join(root, '.git', 'MERGE_HEAD'), `${'a'.repeat(40)}\n`);
    const notInspected = sinon.stub(SdkGeneratePrompts.prototype, 'directoryNotInspected');

    expect((await execute()).isFailed()).to.be.true;

    expect(notInspected.firstCall.args[1]).to.deep.equal({
      kind: 'operationInProgress',
      operation: 'merge',
      root: new DirectoryPath(root)
    });
    expect(generateSdk.called).to.be.false;
  });

  it('reports a directory git could not inspect', async () => {
    (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
    sinon.stub(SdkRepositoryContext.prototype, 'inspect').resolves(err({ reason: 'git broke' }));
    const notInspected = sinon.stub(SdkGeneratePrompts.prototype, 'directoryNotInspected');

    expect((await execute()).isFailed()).to.be.true;

    expect(notInspected.firstCall.args[0].isEqual(sdk())).to.be.true;
    expect(notInspected.firstCall.args[1]).to.deep.equal({ reason: 'git broke' });
  });

  describe('the overwrite question', () => {
    beforeEach(() => write('README.md', '# mine'));

    it('is asked when the directory holds files and there is nothing to merge, and no cancels', async () => {
      const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
      sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');

      expect((await execute({ force: false })).isCancelled()).to.be.true;

      expect(overwriteSdk.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(read('README.md')).to.equal('# mine');
      expect(generateSdk.called).to.be.false;
    });

    it('goes ahead on yes', async () => {
      interactive();
      sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(true);
      sinon.stub(SdkGeneratePrompts.prototype, 'createRepository').resolves(true);

      expect((await execute({ force: false })).isSuccess()).to.be.true;

      expect(read('README.md')).to.equal('# sdk');
      expect(record().isFor(STABLE)).to.be.true;
    });

    it('follows the warning about another generation, and no cancels there too', async () => {
      await recorded({ 'README.md': '# sdk' });
      const notForThis = sinon.stub(SdkGeneratePrompts.prototype, 'recordNotForThisGeneration');
      const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
      sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');

      expect((await execute({ stability: Stability.BETA, force: false })).isCancelled()).to.be.true;

      expect(notForThis.calledBefore(overwriteSdk)).to.be.true;
    });

    it('is skipped by --force', async () => {
      const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk');

      expect((await execute({ force: true })).isSuccess()).to.be.true;

      expect(overwriteSdk.called).to.be.false;
      expect(read('README.md')).to.equal('# sdk');
    });
  });

  describe('sharing through the remote', () => {
    const sh = (cwd: string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd });

    /** The developer's project pushed to a bare origin, its snapshot shared, and a clone of it. */
    const shared = async (): Promise<{ clone: string; origin: string; base: CommitId }> => {
      const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-origin-'));
      const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-clone-'));
      await recorded({ 'README.md': '# sdk' });
      const base = record().pristineCommit();
      await sh(root, 'add', '.');
      await sh(root, 'commit', '-qm', 'sdk');
      await sh(root, 'init', '-q', '--bare', '--initial-branch=main', origin);
      await sh(root, 'remote', 'add', 'origin', origin);
      await sh(root, 'push', '-q', 'origin', 'main');
      await sh(root, 'push', '-q', 'origin', refspec(SnapshotRef.pristine(SdkPath.fromGit('sdk/python')!)));
      await sh(root, 'clone', '-q', '--no-local', origin, clone);
      project = clone;
      return { clone, origin, base };
    };

    it('merges in a clone by itself, fetching the snapshot the origin shared', async () => {
      const { clone, origin } = await shared();
      try {
        expect((await execute({ files: V2 })).isSuccess()).to.be.true;

        expect(merged()).to.be.true;
      } finally {
        fs.rmSync(clone, { recursive: true, force: true });
        fs.rmSync(origin, { recursive: true, force: true });
      }
    });

    it('merges over a clone of an SDK repository named as the destination, not into a language directory in it', async () => {
      const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-origin-'));
      const clone = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-clone-')));
      const published = path.join(root, 'published-sdk');
      try {
        writeFiles(published, GENERATED);
        (await git.init(new DirectoryPath(published)))._unsafeUnwrap();
        const repository = (await repositoryOf(new DirectoryPath(published), STABLE))!;
        const tree = (await repository.snapshotGenerated(new DirectoryPath(published)))._unsafeUnwrap();
        (await repository.record(tree, STABLE))._unsafeUnwrap();
        const base = GenerationRecord.parse(
          fs.readFileSync(path.join(published, '.apimatic/generation.json'), 'utf8')
        )!.pristineCommit();
        await sh(published, 'add', '.');
        await sh(published, 'commit', '-qm', 'sdk');
        await sh(published, 'init', '-q', '--bare', '--initial-branch=main', origin);
        await sh(published, 'remote', 'add', 'origin', origin);
        await sh(published, 'push', '-q', 'origin', 'main');
        await sh(published, 'push', '-q', 'origin', refspec(SnapshotRef.pristine(SdkPath.fromGit('')!)));
        await sh(published, 'clone', '-q', '--no-local', origin, clone);
        writeFiles(clone, { 'README.md': '# edited' });

        expect((await execute({ destination: new DirectoryPath(clone) })).isSuccess()).to.be.true;

        expect(fs.readFileSync(path.join(clone, 'README.md'), 'utf8')).to.equal('# edited');
        expect(fs.existsSync(path.join(clone, 'python'))).to.be.false;
        const recorded = GenerationRecord.parse(
          fs.readFileSync(path.join(clone, '.apimatic/generation.json'), 'utf8')
        )!;
        expect(recorded.pristineCommit().isEqual(base)).to.be.true;
      } finally {
        fs.rmSync(clone, { recursive: true, force: true });
        fs.rmSync(origin, { recursive: true, force: true });
      }
    });
  });
});
