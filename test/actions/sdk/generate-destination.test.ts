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
import { GenerationRecord } from '../../../src/types/sdk/generation-record.js';
import { SdkGeneration } from '../../../src/types/sdk/sdk-generation.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';
import { SdkRepositoryContext } from '../../../src/types/sdk-repository-context.js';
import { terminal } from '../../../src/infrastructure/terminal.js';
import { Files, runMode, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';
import { repositoryOf } from '../../helpers/snapshots.js';

/** A ref onto itself, as `git push` and `git fetch` take it. */
const refspec = (ref: SnapshotRef): string => `${ref}:${ref}`;

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };
const STABLE = SdkGeneration.create({
  language: Language.PYTHON,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
})!;
const GENERATED: Files = { 'README.md': '# sdk' };
const PRISTINE = SnapshotRef.pristine();

/** How the SDK directory is written: decided before the upload, from git and what the directory holds. */
describe('GenerateAction (sdk) — the destination', () => {
  let root: string;
  let generates: (files: Files) => Promise<void>;
  let generateSdk: sinon.SinonStub;
  const git = new GitService();

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));
  const at = (relative: string) => path.join(sdk().toString(), relative);
  const read = (relative: string) => fs.readFileSync(at(relative), 'utf8');
  const write = (relative: string, contents: string) => writeFiles(sdk().toString(), { [relative]: contents });
  const record = () => GenerationRecord.parse(read('.apimatic/generation.json'))!;
  /** What a developer sees after a merge: the generator's change landed in the edited directory, and the run said so. */
  const V2: Files = { 'README.md': '# sdk v2' };
  const merged = () =>
    read('README.md') === '# sdk v2' && (SdkGeneratePrompts.prototype.sdkMerged as sinon.SinonStub).calledOnce;
  const sh = (cwd: string, ...args: string[]) =>
    execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd });

  const execute = async (
    options: {
      force?: boolean;
      gitInit?: boolean;
      stability?: Stability;
      files?: Files;
      destination?: DirectoryPath;
    } = {}
  ) => {
    await generates(options.files ?? GENERATED);
    return new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(root)),
      options.destination ?? sdk(),
      {
        language: Language.PYTHON,
        codegenVersion: CodeGenerationVersion.V4,
        stability: options.stability ?? Stability.STABLE
      },
      runMode(options.force ?? true, options.gitInit)
    );
  };

  /** A recorded generation of `files` in the SDK directory's own repository, so the directory has a base. */
  const recorded = async (files: Files): Promise<SdkRepositoryContext> => {
    writeFiles(sdk().toString(), files);
    (await git.init(sdk()))._unsafeUnwrap();
    const repository = (await repositoryOf(sdk(), STABLE))!;
    (await repository.recordFresh(sdk(), STABLE))._unsafeUnwrap();
    return repository;
  };

  /** Leaves `relative` unmerged in the index, as a conflicted run does. */
  const unmerged = async (relative: string) => {
    const cwd = sdk().toString();
    const oid = (await execa('git', ['hash-object', '-w', '--stdin'], { cwd, input: 'x' })).stdout.trim();
    const entries = [1, 2, 3].map((stage) => `100644 ${oid} ${stage}\t${relative}`).join('\0') + '\0';
    await execa('git', ['update-index', '-z', '--index-info'], { cwd, input: entries });
  };

  /** The recorded SDK committed and pushed to a bare origin with its snapshot, and a clone of it. */
  const published = async (): Promise<{ clone: string; origin: string; base: CommitId }> => {
    const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-origin-'));
    const clone = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-clone-')));
    await recorded(GENERATED);
    const base = record().pristineCommit();
    const cwd = sdk().toString();
    await sh(cwd, 'add', '.');
    await sh(cwd, 'commit', '-qm', 'sdk');
    await sh(cwd, 'init', '-q', '--bare', '--initial-branch=main', origin);
    await sh(cwd, 'remote', 'add', 'origin', origin);
    // Hooks skipped, as a tool that bypasses them pushes, so the snapshot reaches the origin only when pushed by hand.
    await sh(cwd, 'push', '-q', '--no-verify', 'origin', 'main');
    await sh(cwd, 'clone', '-q', '--no-local', origin, clone);
    return { clone, origin, base };
  };

  beforeEach(() => {
    root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-')));
    ({ generates, generateSdk } = stubSdkGeneration(root));
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryFound');
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

  describe('when the SDK directory is not a repository of its own', () => {
    for (const [how, tty, force] of [
      ['in a terminal', true, false],
      ['without a terminal', false, false],
      ['with --force', true, true]
    ] as const) {
      it(`makes it one with --git-init and records into it, ${how}`, async () => {
        sinon.stub(terminal, 'isInteractive').returns(tty);
        const repositoryInitialised = SdkGeneratePrompts.prototype.repositoryInitialised as sinon.SinonStub;

        expect((await execute({ force, gitInit: true })).isSuccess()).to.be.true;

        expect(repositoryInitialised.firstCall.args[0].isEqual(sdk())).to.be.true;
        expect(fs.readFileSync(at('.git/HEAD'), 'utf-8').trim()).to.equal('ref: refs/heads/main');
        expect(record().isFor(STABLE)).to.be.true;
      });

      it(`writes the SDK without a repository otherwise, and warns that edits will not persist, ${how}`, async () => {
        sinon.stub(terminal, 'isInteractive').returns(tty);
        const notCreated = SdkGeneratePrompts.prototype.repositoryNotCreated as sinon.SinonStub;

        expect((await execute({ force })).isSuccess()).to.be.true;

        expect(notCreated.firstCall.args[0].isEqual(sdk())).to.be.true;
        expect(fs.readdirSync(sdk().toString())).to.deep.equal(['README.md']);
      });
    }

    it('leaves a project repository that only encloses it alone', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
      const notCreated = SdkGeneratePrompts.prototype.repositoryNotCreated as sinon.SinonStub;

      expect((await execute()).isSuccess()).to.be.true;

      expect(notCreated.calledOnce).to.be.true;
      expect(fs.existsSync(at('.apimatic'))).to.be.false;
      const refs = await execa('git', ['for-each-ref', 'refs/apimatic'], { cwd: root });
      expect(refs.stdout).to.equal('');
      expect(fs.readdirSync(path.join(root, '.git', 'hooks'))).to.not.include('pre-push');
    });

    it('makes it a repository inside the project repository with --git-init, keeping the snapshots there', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();

      expect((await execute({ gitInit: true })).isSuccess()).to.be.true;

      expect((await git.resolveRef(sdk(), PRISTINE))._unsafeUnwrap()).to.deep.equal(record().pristineCommit());
      expect((await execa('git', ['for-each-ref', 'refs/apimatic'], { cwd: root })).stdout).to.equal('');
    });
  });

  it('records into the SDK directory’s own repository when it has no record, and says it found it', async () => {
    fs.mkdirSync(sdk().toString(), { recursive: true });
    (await git.init(sdk()))._unsafeUnwrap();
    const repositoryFound = SdkGeneratePrompts.prototype.repositoryFound as sinon.SinonStub;

    expect((await execute()).isSuccess()).to.be.true;

    expect(repositoryFound.firstCall.args[0].isEqual(sdk())).to.be.true;
    expect((await git.resolveRef(sdk(), PRISTINE))._unsafeUnwrap()).to.deep.equal(record().pristineCommit());
  });

  it('records over an SDK generated at another stability, asking only whether to overwrite it', async () => {
    await recorded({ 'README.md': '# sdk' });
    interactive();
    const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(true);
    const repositoryFound = SdkGeneratePrompts.prototype.repositoryFound as sinon.SinonStub;

    expect((await execute({ stability: Stability.BETA, force: false })).isSuccess()).to.be.true;

    expect(overwriteSdk.calledOnce).to.be.true;
    expect(repositoryFound.called).to.be.false;
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
    expect(record().pristineCommit()).to.not.deep.equal(missing);
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
    it(`replaces, with --force, an SDK recorded for ${what}, warning, and records it for the next run`, async () => {
      await recorded({ 'README.md': '# sdk' });
      write('README.md', '# edited');
      sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');
      const replaced = sinon.stub(SdkGeneratePrompts.prototype, 'recordedSdkReplaced');
      const repositoryFound = SdkGeneratePrompts.prototype.repositoryFound as sinon.SinonStub;
      const options = await prepare();
      const before = record().pristineCommit();

      const result = await execute({ ...options, force: true, files: V2 });

      expect(result.isSuccess()).to.be.true;
      expect(replaced.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(repositoryFound.called).to.be.false;
      expect(read('README.md')).to.equal('# sdk v2');
      expect(record().pristineCommit()).to.not.deep.equal(before);
      expect((await git.resolveRef(sdk(), PRISTINE))._unsafeUnwrap()).to.deep.equal(record().pristineCommit());
    });
  }

  it('merges in a clone only once the pristine refs were fetched by hand, and says how', async () => {
    const { clone, origin } = await published();
    try {
      const snapshotMissing = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');
      interactive();
      sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
      sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');
      const destination = new DirectoryPath(clone);

      expect((await execute({ force: false, destination })).isCancelled()).to.be.true;
      expect(snapshotMissing.firstCall.args[0]).to.deep.equal({ kind: 'absent', remote: RemoteName.origin() });
      expect(generateSdk.called).to.be.false;

      await sh(sdk().toString(), 'push', '-q', '--no-verify', 'origin', refspec(PRISTINE));
      await sh(clone, 'fetch', '-q', 'origin', `+${refspec(PRISTINE)}`);

      expect((await execute({ force: false, files: V2, destination })).isSuccess()).to.be.true;
      expect(fs.readFileSync(path.join(clone, 'README.md'), 'utf8')).to.equal('# sdk v2');
    } finally {
      fs.rmSync(clone, { recursive: true, force: true });
      fs.rmSync(origin, { recursive: true, force: true });
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

  it('refuses without a terminal while git holds a file of the SDK as unmerged', async () => {
    await recorded({ 'README.md': '# sdk', 'a.py': 'x' });
    write('a.py', '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n');
    await unmerged('a.py');
    const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

    expect((await execute({ force: false })).isFailed()).to.be.true;

    expect(conflictsUnresolved.firstCall.args[0].map(String)).to.deep.equal(['a.py']);
    expect(generateSdk.called).to.be.false;
  });

  it('refuses an unmerged file before looking at the record, so another stability or no record cannot write over it', async () => {
    await recorded({ 'README.md': '# sdk', 'a.py': 'x' });
    write('a.py', '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n');
    await unmerged('a.py');
    const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

    expect((await execute({ stability: Stability.BETA, force: false })).isFailed()).to.be.true;
    fs.rmSync(at('.apimatic'), { recursive: true });
    expect((await execute({ force: false })).isFailed()).to.be.true;

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

    it('cancels, touching nothing, when the developer will finish resolving or backs out', async () => {
      await marked();
      sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves('resolve');
      const resolveLater = sinon.stub(SdkGeneratePrompts.prototype, 'resolveLater');

      expect((await execute({ force: false, files: FILES })).isCancelled()).to.be.true;

      expect(read('a.py')).to.equal('kept above\n' + MARKED + 'kept below\n');
      expect(resolveLater.calledOnce).to.be.true;
      expect(generateSdk.called).to.be.false;
    });

    it('settles them for the generator without asking under --force, then merges', async () => {
      await marked();
      const unresolvedChoice = sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice');
      const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      expect((await execute({ force: true, files: { ...FILES, ...V2 } })).isSuccess()).to.be.true;

      expect(unresolvedChoice.called).to.be.false;
      expect(read('a.py')).to.equal('kept above\ntheirs\nkept below\n');
      expect(conflictsResolved.firstCall.args[0]).to.equal('generated');
      expect(merged()).to.be.true;
    });

    it('does not ask without a terminal, and stops', async () => {
      await marked();
      (terminal.isInteractive as sinon.SinonStub).returns(false);
      const unresolvedChoice = sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice');
      const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

      expect((await execute({ force: false, files: FILES })).isFailed()).to.be.true;

      expect(unresolvedChoice.called).to.be.false;
      expect(conflictsUnresolved.calledOnce).to.be.true;
    });
  });

  it('treats an SDK directory inside another SDK’s repository as having none, leaving that repository alone', async () => {
    await recorded({ 'README.md': '# sdk' });
    const before = (await execa('git', ['for-each-ref', 'refs/apimatic'], { cwd: sdk().toString() })).stdout;
    const notCreated = SdkGeneratePrompts.prototype.repositoryNotCreated as sinon.SinonStub;

    expect((await execute({ destination: sdk().join('python') })).isSuccess()).to.be.true;

    expect(notCreated.firstCall.args[0].isEqual(sdk().join('python'))).to.be.true;
    expect((await execa('git', ['for-each-ref', 'refs/apimatic'], { cwd: sdk().toString() })).stdout).to.equal(before);
  });

  it('refuses while the repository is in the middle of a merge of the developer’s own', async () => {
    await recorded({ 'README.md': '# sdk' });
    fs.writeFileSync(at('.git/MERGE_HEAD'), `${'a'.repeat(40)}\n`);
    const notInspected = sinon.stub(SdkGeneratePrompts.prototype, 'directoryNotInspected');

    expect((await execute()).isFailed()).to.be.true;

    expect(notInspected.firstCall.args[0]).to.deep.equal({
      kind: 'operationInProgress',
      operation: 'merge',
      root: sdk()
    });
    expect(generateSdk.called).to.be.false;
  });

  it('reports a directory git could not inspect', async () => {
    fs.mkdirSync(sdk().toString(), { recursive: true });
    (await git.init(sdk()))._unsafeUnwrap();
    sinon.stub(SdkRepositoryContext.prototype, 'inspect').resolves(err({ reason: 'git broke' }));
    const notInspected = sinon.stub(SdkGeneratePrompts.prototype, 'directoryNotInspected');

    expect((await execute()).isFailed()).to.be.true;

    expect(notInspected.firstCall.args[0]).to.deep.equal({ reason: 'git broke' });
  });

  it('asks before replacing a repository of the developer’s own that holds only hidden files besides .git', async () => {
    fs.mkdirSync(sdk().toString(), { recursive: true });
    (await git.init(sdk()))._unsafeUnwrap();
    write('.github/workflows/publish.yml', 'on: push');
    interactive();
    const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
    sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');

    expect((await execute({ force: false })).isCancelled()).to.be.true;

    expect(overwriteSdk.calledOnce).to.be.true;
    expect(read('.github/workflows/publish.yml')).to.equal('on: push');
    expect(generateSdk.called).to.be.false;
  });

  describe('the overwrite question', () => {
    beforeEach(() => write('README.md', '# mine'));

    it('is asked when the directory holds files and there is nothing to merge, and no cancels', async () => {
      interactive();
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

      expect((await execute({ force: false, gitInit: true })).isSuccess()).to.be.true;

      expect(read('README.md')).to.equal('# sdk');
      expect(record().isFor(STABLE)).to.be.true;
    });

    it('is the only thing said over an SDK recorded for another generation, and no cancels there too', async () => {
      await recorded({ 'README.md': '# sdk' });
      interactive();
      const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
      const destinationNotice = sinon.spy(SdkGeneratePrompts.prototype, 'destinationNotice');
      sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');

      expect((await execute({ stability: Stability.BETA, force: false })).isCancelled()).to.be.true;

      expect(overwriteSdk.calledOnce).to.be.true;
      expect(destinationNotice.called).to.be.false;
    });

    it('is skipped by --force', async () => {
      const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk');

      expect((await execute({ force: true })).isSuccess()).to.be.true;

      expect(overwriteSdk.called).to.be.false;
      expect(read('README.md')).to.equal('# sdk');
    });
  });

  it('merges over a clone of an SDK repository named as the destination, fetching the snapshot the origin shared', async () => {
    const { clone, origin, base } = await published();
    try {
      await sh(sdk().toString(), 'push', '-q', '--no-verify', 'origin', refspec(PRISTINE));
      writeFiles(clone, { 'README.md': '# edited' });

      expect((await execute({ destination: new DirectoryPath(clone) })).isSuccess()).to.be.true;

      expect(fs.readFileSync(path.join(clone, 'README.md'), 'utf8')).to.equal('# edited');
      expect(fs.existsSync(path.join(clone, 'python'))).to.be.false;
      const recordedInClone = GenerationRecord.parse(
        fs.readFileSync(path.join(clone, '.apimatic/generation.json'), 'utf8')
      )!;
      expect(recordedInClone.pristineCommit()).to.deep.equal(base);
    } finally {
      fs.rmSync(clone, { recursive: true, force: true });
      fs.rmSync(origin, { recursive: true, force: true });
    }
  });
});
