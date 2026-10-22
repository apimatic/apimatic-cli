import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { err } from 'neverthrow';
import sinon from 'sinon';
import { GenerateAction } from '../../../src/actions/sdk/generate.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { SdkContext } from '../../../src/types/sdk-context.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, SdkGeneration } from '../../../src/types/sdk/generation-record.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';
import { SdkRepositoryContext } from '../../../src/types/sdk-repository-context.js';
import { terminal } from '../../../src/utils/terminal-utils.js';
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };
const STABLE: SdkGeneration = {
  language: Language.PYTHON,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
};
const GENERATED: Files = { 'README.md': '# sdk' };

const rel = (value: string) => RelativeFilePath.fromGit(value);

/** How the SDK directory is written: decided before the upload, from git and what the directory holds. */
describe('GenerateAction (sdk) — the destination', () => {
  let root: string;
  let project: string;
  let generates: (files: Files) => Promise<void>;
  let generateSdk: sinon.SinonStub;
  const git = new GitService();

  const sdk = () => new DirectoryPath(path.join(project, 'sdk', 'python'));
  const sdkContext = () => new SdkContext(Language.PYTHON, new DirectoryPath(path.join(project, 'sdk')));
  const at = (relative: string) => path.join(sdk().toString(), relative);
  const read = (relative: string) => fs.readFileSync(at(relative), 'utf8');
  const write = (relative: string, contents: string) => writeFiles(sdk().toString(), { [relative]: contents });
  const record = () => GenerationRecord.parse(read('.apimatic/generation.json'))!;
  /** A merge keeps the base as the pristine snapshot (the generation is unchanged) and saves the pre-run state. */
  const mergedAgainst = async (repository: SdkRepositoryContext, base: CommitId) =>
    record().pristineCommit().isEqual(base) &&
    (await git.resolveRef(repository.root(), repository.previousRef())) !== undefined;

  const execute = async (
    options: { force?: boolean; stability?: Stability; files?: Files; destination?: DirectoryPath } = {}
  ) => {
    await generates(options.files ?? GENERATED);
    return new GenerateAction(new DirectoryPath(project), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(project)),
      options.destination ?? new DirectoryPath(path.join(project, 'sdk')),
      Language.PYTHON,
      options.stability ?? Stability.STABLE,
      options.force ?? true
    );
  };

  /** A recorded generation of `files`, so the directory has a base; `conflicts` as the last run left them. */
  const recorded = async (files: Files, conflicts: string[] = []): Promise<SdkRepositoryContext> => {
    writeFiles(sdk().toString(), files);
    await git.init(new DirectoryPath(root));
    const repository = (await sdkContext().repository())!;
    const tree = (await repository.snapshotGenerated(sdk()))._unsafeUnwrap();
    (await repository.recordGeneration(tree, STABLE, '0.0.0', conflicts.map(rel)))._unsafeUnwrap();
    return repository;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-'));
    project = root;
    ({ generates, generateSdk } = stubSdkGeneration(root));
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  for (const [found, output] of [
    ['no git', undefined],
    ['an older git', 'git version 2.30.2']
  ] as const) {
    it(`with ${found}, warns that customizations will not persist and overwrites`, async () => {
      sinon.stub(GitService.prototype, 'version').resolves(output === undefined ? undefined : GitVersion.parse(output));
      const gitUnavailable = sinon.stub(SdkGeneratePrompts.prototype, 'gitUnavailable');

      expect((await execute()).isSuccess()).to.be.true;

      expect(gitUnavailable.firstCall.args[0]?.toString()).to.equal(output === undefined ? undefined : '2.30.2');
      expect(fs.readdirSync(sdk().toString())).to.deep.equal(['README.md']);
    });
  }

  it('records into a repository of its own when nothing encloses the SDK directory', async () => {
    expect((await execute()).isSuccess()).to.be.true;

    expect(fs.readFileSync(at('.git/HEAD'), 'utf-8').trim()).to.equal('ref: refs/heads/main');
    expect(record().isFor(STABLE)).to.be.true;
  });

  it('records into the enclosing repository when the directory has no record', async () => {
    await git.init(new DirectoryPath(root));

    expect((await execute()).isSuccess()).to.be.true;

    expect(fs.existsSync(at('.git'))).to.be.false;
    const ref = SnapshotRef.pristine('sdk/python');
    expect((await git.resolveRef(new DirectoryPath(root), ref))?.isEqual(record().pristineCommit())).to.be.true;
  });

  it('records over an SDK generated at another stability, after saying so', async () => {
    await recorded({ 'README.md': '# sdk' });
    const notForThis = sinon.stub(SdkGeneratePrompts.prototype, 'recordNotForThisGeneration');

    expect((await execute({ stability: Stability.BETA })).isSuccess()).to.be.true;

    expect(notForThis.firstCall.args[0]).to.deep.equal(STABLE);
    expect(notForThis.firstCall.args[1].stability).to.equal(Stability.BETA);
    expect(record().isFor(STABLE)).to.be.false;
  });

  it('records over an SDK whose snapshot the repository does not hold, after saying so', async () => {
    await recorded({ 'README.md': '# sdk' });
    const missing = CommitId.create('f'.repeat(40))!;
    write('.apimatic/generation.json', GenerationRecord.written(STABLE, missing, new Date(), '0.0.0').toJson());
    const snapshotMissing = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');

    expect((await execute()).isSuccess()).to.be.true;

    expect(snapshotMissing.firstCall.args[0]).to.deep.equal({ kind: 'noRemote' });
    expect(record().pristineCommit().isEqual(missing)).to.be.false;
  });

  it('merges in a clone only once the pristine refs were fetched by hand, and says how', async () => {
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-remote-'));
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-clone-'));
    const sh = (cwd: string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd });
    try {
      const repository = await recorded({ 'README.md': '# sdk' });
      const base = (await repository.readRecord())!.pristineCommit();
      await sh(root, 'add', '.');
      await sh(root, 'commit', '-qm', 'sdk');
      await sh(root, 'init', '-q', '--bare', remote);
      await sh(root, 'remote', 'add', 'origin', remote);
      await sh(root, 'push', '-q', 'origin', 'main');
      await sh(root, 'clone', '-q', '--no-local', remote, clone);
      project = clone;
      const snapshotMissing = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');
      sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
      sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');

      expect((await execute({ force: false })).isCancelled()).to.be.true;
      expect(snapshotMissing.firstCall.args[0]).to.deep.equal({ kind: 'absent', remote: 'origin' });
      expect(generateSdk.called).to.be.false;

      await sh(root, 'push', '-q', 'origin', 'refs/apimatic/pristine/*:refs/apimatic/pristine/*');
      await sh(clone, 'fetch', '-q', 'origin', '+refs/apimatic/pristine/*:refs/apimatic/pristine/*');

      expect((await execute({ force: false })).isSuccess()).to.be.true;
      expect(await mergedAgainst((await sdkContext().repository())!, base)).to.be.true;
    } finally {
      fs.rmSync(remote, { recursive: true, force: true });
      fs.rmSync(clone, { recursive: true, force: true });
    }
  });

  it('merges against the recorded snapshot, without asking, when the record and its commit are there', async () => {
    const repository = await recorded({ 'README.md': '# sdk' });
    const base = (await repository.readRecord())!.pristineCommit();
    write('README.md', '# edited');
    const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk');

    expect((await execute({ force: false })).isSuccess()).to.be.true;

    expect(overwriteSdk.called).to.be.false;
    expect(read('README.md')).to.equal('# edited');
    expect(await mergedAgainst(repository, base)).to.be.true;
  });

  it('refuses while a listed file still holds the markers', async () => {
    await recorded({ 'README.md': '# sdk', 'a.py': 'x' }, ['a.py']);
    write('a.py', '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n');
    const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

    expect((await execute()).isFailed()).to.be.true;

    expect(conflictsUnresolved.firstCall.args[0].map(String)).to.deep.equal(['a.py']);
    expect(generateSdk.called).to.be.false;
  });

  describe('the question while markers are still there', () => {
    const MARKED = '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n';
    const FILES: Files = { 'README.md': '# sdk', 'a.py': 'generated' };

    /** A recorded generation whose `a.py` the developer left with markers, after the pre-run state was kept. */
    const marked = async () => {
      const repository = await recorded(FILES, ['a.py']);
      const base = (await repository.readRecord())!.pristineCommit();
      write('a.py', 'before the run');
      (await repository.savePrevious(base))._unsafeUnwrap();
      write('a.py', 'kept above\n' + MARKED + 'kept below\n');
      write('b.py', 'resolved by hand');
      sinon.stub(terminal, 'isInteractive').returns(true);
      return { repository, base };
    };

    it('settles the markers still there for the generator, keeping the rest of the file, then merges', async () => {
      const { repository, base } = await marked();
      sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves('generated');
      const resolvedForGenerator = sinon.stub(SdkGeneratePrompts.prototype, 'resolvedForGenerator');

      expect((await execute({ force: false, files: FILES })).isSuccess()).to.be.true;

      expect(read('a.py')).to.equal('kept above\ntheirs\nkept below\n');
      expect(read('b.py')).to.equal('resolved by hand');
      expect(resolvedForGenerator.firstCall.args[0].map(String)).to.deep.equal(['a.py']);
      expect(await mergedAgainst(repository, base)).to.be.true;
    });

    it('puts the directory back as it was before the run on undo, then merges from there', async () => {
      const { repository, base } = await marked();
      sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves('undo');
      const previousRestored = sinon.stub(SdkGeneratePrompts.prototype, 'previousRestored');

      expect((await execute({ force: false, files: FILES })).isSuccess()).to.be.true;

      expect(read('a.py')).to.equal('before the run');
      expect(fs.existsSync(at('b.py'))).to.be.false;
      expect(previousRestored.calledOnce).to.be.true;
      expect(await mergedAgainst(repository, base)).to.be.true;
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

    it('does not ask with --force or without a terminal', async () => {
      await marked();
      (terminal.isInteractive as sinon.SinonStub).returns(false);
      const unresolvedChoice = sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice');
      const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

      expect((await execute({ force: false, files: FILES })).isFailed()).to.be.true;

      expect(unresolvedChoice.called).to.be.false;
      expect(conflictsUnresolved.calledOnce).to.be.true;
    });
  });

  it('refuses an SDK directory nested in one that has snapshots', async () => {
    await recorded({ 'README.md': '# sdk' });
    const nestedSdkDirectory = sinon.stub(SdkGeneratePrompts.prototype, 'nestedSdkDirectory');

    expect((await execute({ destination: sdk() })).isFailed()).to.be.true;

    expect(nestedSdkDirectory.firstCall.args[0].isEqual(sdk().join('python'))).to.be.true;
    expect(nestedSdkDirectory.firstCall.args[1].other.isEqual(sdk())).to.be.true;
    expect(nestedSdkDirectory.firstCall.args[1].encloses).to.be.true;
    expect(generateSdk.called).to.be.false;
  });

  it('reports a directory git could not inspect', async () => {
    await git.init(new DirectoryPath(root));
    sinon.stub(SdkRepositoryContext.prototype, 'inspect').resolves(err({ kind: 'gitFailed', reason: 'git broke' }));
    const notInspected = sinon.stub(SdkGeneratePrompts.prototype, 'directoryNotInspected');

    expect((await execute()).isFailed()).to.be.true;

    expect(notInspected.firstCall.args[0]).to.equal('git broke');
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
      sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(true);

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
      const repository = await recorded({ 'README.md': '# sdk' });
      const base = (await repository.readRecord())!.pristineCommit();
      await sh(root, 'add', '.');
      await sh(root, 'commit', '-qm', 'sdk');
      await sh(root, 'init', '-q', '--bare', origin);
      await sh(root, 'remote', 'add', 'origin', origin);
      await sh(root, 'push', '-q', 'origin', 'main');
      await sh(root, 'push', '-q', 'origin', repository.pristineRef().refspec());
      await sh(root, 'clone', '-q', '--no-local', origin, clone);
      project = clone;
      return { clone, origin, base };
    };

    it('merges in a clone by itself, fetching the snapshot the origin shared', async () => {
      const { clone, origin, base } = await shared();
      try {
        expect((await execute()).isSuccess()).to.be.true;

        expect(await mergedAgainst((await sdkContext().repository())!, base)).to.be.true;
      } finally {
        fs.rmSync(clone, { recursive: true, force: true });
        fs.rmSync(origin, { recursive: true, force: true });
      }
    });
  });
});
