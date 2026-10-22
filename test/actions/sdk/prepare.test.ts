import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { err } from 'neverthrow';
import sinon from 'sinon';
import { SdkPrepareAction } from '../../../src/actions/sdk/prepare.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { SdkPreparePrompts } from '../../../src/prompts/sdk/prepare.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
import { SdkContext } from '../../../src/types/sdk-context.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, SdkGeneration } from '../../../src/types/sdk/generation-record.js';
import { SdkRepositoryContext } from '../../../src/types/sdk-repository-context.js';
import { terminal } from '../../../src/utils/terminal-utils.js';

const STABLE: SdkGeneration = {
  language: Language.PYTHON,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
};
const BETA: SdkGeneration = { ...STABLE, stability: Stability.BETA };

const rel = (value: string) => RelativeFilePath.fromGit(value);

describe('SdkPrepareAction', () => {
  let root: string;
  let sdkContext: SdkContext;
  const git = new GitService();

  const execute = (options: { force?: boolean; generation?: SdkGeneration } = {}) =>
    new SdkPrepareAction().execute(sdkContext, options.generation ?? STABLE, options.force ?? true);

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));
  const write = (relative: string, contents: string) => {
    const target = path.join(sdk().toString(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  /** A recorded generation of `files`, so the directory has a base; `conflicts` as the last run left them. */
  const recorded = async (files: Record<string, string>, conflicts: string[] = []): Promise<SdkRepositoryContext> => {
    for (const [relative, contents] of Object.entries(files)) {
      write(relative, contents);
    }
    await git.init(new DirectoryPath(root));
    const repository = (await sdkContext.repository())!;
    const tree = (await repository.snapshotGenerated(sdk()))._unsafeUnwrap();
    (await repository.recordGeneration(tree, STABLE, '0.0.0', conflicts.map(rel)))._unsafeUnwrap();
    return repository;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-sdk-'));
    sdkContext = new SdkContext(Language.PYTHON, new DirectoryPath(path.join(root, 'sdk')));
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
      const gitUnavailable = sinon.stub(SdkPreparePrompts.prototype, 'gitUnavailable');

      expect((await execute()).getValue()).to.deep.equal({ kind: 'overwrite' });
      expect(gitUnavailable.firstCall.args[0]?.toString()).to.equal(output === undefined ? undefined : '2.30.2');
    });
  }

  it('records into a repository still to be made when nothing encloses the SDK directory', async () => {
    expect((await execute()).getValue()).to.deep.equal({ kind: 'record', repository: undefined });
  });

  it('records into the enclosing repository when the directory has no record', async () => {
    await git.init(new DirectoryPath(root));

    const destination = (await execute()).getValue();

    expect(destination.kind).to.equal('record');
    expect(destination.kind === 'record' && destination.repository?.root().toString()).to.equal(
      new DirectoryPath(root).toString()
    );
  });

  it('records over an SDK generated at another stability, after saying so', async () => {
    await recorded({ 'README.md': '# sdk' });
    const notForThis = sinon.stub(SdkPreparePrompts.prototype, 'recordNotForThisGeneration');

    expect((await execute({ generation: BETA })).getValue().kind).to.equal('record');
    expect(notForThis.firstCall.args[0]).to.deep.equal(STABLE);
    expect(notForThis.firstCall.args[1]).to.deep.equal(BETA);
  });

  it('records over an SDK whose snapshot the repository does not hold, after saying so', async () => {
    await recorded({ 'README.md': '# sdk' });
    const missing = CommitId.create('f'.repeat(40))!;
    write('.apimatic/generation.json', GenerationRecord.written(STABLE, missing, new Date(), '0.0.0').toJson());
    const snapshotMissing = sinon.stub(SdkPreparePrompts.prototype, 'snapshotMissing');

    expect((await execute()).getValue().kind).to.equal('record');
    expect(snapshotMissing.firstCall.args[0]).to.deep.equal({ kind: 'noRemote' });
  });

  it('merges in a clone only once the pristine refs were fetched by hand, and says how', async () => {
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-sdk-remote-'));
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-sdk-clone-'));
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
      sdkContext = new SdkContext(Language.PYTHON, new DirectoryPath(path.join(clone, 'sdk')));
      const snapshotMissing = sinon.stub(SdkPreparePrompts.prototype, 'snapshotMissing');

      expect((await execute()).getValue().kind).to.equal('record');
      expect(snapshotMissing.firstCall.args[0]).to.deep.equal({ kind: 'absent', remote: 'origin' });

      await sh(root, 'push', '-q', 'origin', 'refs/apimatic/pristine/*:refs/apimatic/pristine/*');
      await sh(clone, 'fetch', '-q', 'origin', '+refs/apimatic/pristine/*:refs/apimatic/pristine/*');

      const destination = (await execute()).getValue();
      expect(destination.kind).to.equal('merge');
      expect(destination.kind === 'merge' && destination.base.isEqual(base)).to.be.true;
    } finally {
      fs.rmSync(remote, { recursive: true, force: true });
      fs.rmSync(clone, { recursive: true, force: true });
    }
  });

  it('merges against the recorded snapshot, without asking, when the record and its commit are there', async () => {
    const repository = await recorded({ 'README.md': '# sdk' });
    write('README.md', '# edited');
    const overwriteSdk = sinon.stub(SdkPreparePrompts.prototype, 'overwriteSdk');

    const destination = (await execute({ force: false })).getValue();

    expect(destination.kind).to.equal('merge');
    expect(destination.kind === 'merge' && destination.repository.root().isEqual(repository.root())).to.be.true;
    expect(destination.kind === 'merge' && destination.base.isEqual((await repository.readRecord())!.pristineCommit()))
      .to.be.true;
    expect(overwriteSdk.called).to.be.false;
  });

  it('refuses while a listed file still holds the markers', async () => {
    await recorded({ 'README.md': '# sdk', 'a.py': 'x' }, ['a.py']);
    write('a.py', '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n');
    const conflictsUnresolved = sinon.stub(SdkPreparePrompts.prototype, 'conflictsUnresolved');

    expect((await execute()).isFailed()).to.be.true;
    expect(conflictsUnresolved.firstCall.args[0].map(String)).to.deep.equal(['a.py']);
  });

  describe('the question while markers are still there', () => {
    const MARKED = '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n';

    /** A recorded generation whose `a.py` the developer left with markers, after the pre-run state was kept. */
    const marked = async () => {
      const repository = await recorded({ 'README.md': '# sdk', 'a.py': 'generated' }, ['a.py']);
      const base = (await repository.readRecord())!.pristineCommit();
      write('a.py', 'before the run');
      (await repository.savePrevious(base))._unsafeUnwrap();
      write('a.py', 'kept above\n' + MARKED + 'kept below\n');
      write('b.py', 'resolved by hand');
      sinon.stub(terminal, 'isInteractive').returns(true);
      return { repository, base };
    };

    const read = (relative: string) => fs.readFileSync(path.join(sdk().toString(), relative), 'utf8');

    it('settles the markers still there for the generator, keeping the rest of the file, then merges', async () => {
      const { repository, base } = await marked();
      sinon.stub(SdkPreparePrompts.prototype, 'unresolvedChoice').resolves('generated');
      const resolvedForGenerator = sinon.stub(SdkPreparePrompts.prototype, 'resolvedForGenerator');

      const destination = (await execute({ force: false })).getValue();

      expect(destination.kind === 'merge' && destination.base.isEqual(base)).to.be.true;
      expect(read('a.py')).to.equal('kept above\ntheirs\nkept below\n');
      expect(read('b.py')).to.equal('resolved by hand');
      expect(resolvedForGenerator.firstCall.args[0].map(String)).to.deep.equal(['a.py']);
      expect(repository).to.not.be.undefined;
    });

    it('puts the directory back as it was before the run on undo, then merges from there', async () => {
      const { base } = await marked();
      sinon.stub(SdkPreparePrompts.prototype, 'unresolvedChoice').resolves('undo');
      const previousRestored = sinon.stub(SdkPreparePrompts.prototype, 'previousRestored');

      const destination = (await execute({ force: false })).getValue();

      expect(destination.kind === 'merge' && destination.base.isEqual(base)).to.be.true;
      expect(read('a.py')).to.equal('before the run');
      expect(fs.existsSync(path.join(sdk().toString(), 'b.py'))).to.be.false;
      expect(previousRestored.calledOnce).to.be.true;
    });

    it('stops, touching nothing, when the developer will finish resolving or backs out', async () => {
      await marked();
      sinon.stub(SdkPreparePrompts.prototype, 'unresolvedChoice').resolves(undefined);
      const resolveLater = sinon.stub(SdkPreparePrompts.prototype, 'resolveLater');

      expect((await execute({ force: false })).isFailed()).to.be.true;
      expect(read('a.py')).to.equal('kept above\n' + MARKED + 'kept below\n');
      expect(resolveLater.calledOnce).to.be.true;
    });

    it('does not ask with --force or without a terminal', async () => {
      await marked();
      (terminal.isInteractive as sinon.SinonStub).returns(false);
      const unresolvedChoice = sinon.stub(SdkPreparePrompts.prototype, 'unresolvedChoice');
      const conflictsUnresolved = sinon.stub(SdkPreparePrompts.prototype, 'conflictsUnresolved');

      expect((await execute({ force: false })).isFailed()).to.be.true;
      expect(unresolvedChoice.called).to.be.false;
      expect(conflictsUnresolved.calledOnce).to.be.true;
    });
  });

  it('refuses an SDK directory nested in one that has snapshots', async () => {
    await recorded({ 'README.md': '# sdk' });
    sdkContext = new SdkContext(Language.PYTHON, sdk());
    const nestedSdkDirectory = sinon.stub(SdkPreparePrompts.prototype, 'nestedSdkDirectory');

    expect((await execute()).isFailed()).to.be.true;
    expect(nestedSdkDirectory.firstCall.args[0].isEqual(sdk().join('python'))).to.be.true;
    expect(nestedSdkDirectory.firstCall.args[1].other.isEqual(sdk())).to.be.true;
    expect(nestedSdkDirectory.firstCall.args[1].encloses).to.be.true;
  });

  it('reports a directory git could not inspect', async () => {
    await git.init(new DirectoryPath(root));
    sinon.stub(SdkRepositoryContext.prototype, 'inspect').resolves(err({ kind: 'gitFailed', reason: 'git broke' }));
    const notInspected = sinon.stub(SdkPreparePrompts.prototype, 'directoryNotInspected');

    expect((await execute()).isFailed()).to.be.true;
    expect(notInspected.firstCall.args[0]).to.equal('git broke');
  });

  describe('the overwrite question', () => {
    beforeEach(() => write('README.md', '# mine'));

    it('is asked when the directory holds files and there is nothing to merge, and no cancels', async () => {
      const overwriteSdk = sinon.stub(SdkPreparePrompts.prototype, 'overwriteSdk').resolves(false);
      sinon.stub(SdkPreparePrompts.prototype, 'destinationDirNotEmpty');

      expect((await execute({ force: false })).isCancelled()).to.be.true;
      expect(overwriteSdk.firstCall.args[0].isEqual(sdk())).to.be.true;
    });

    it('goes ahead on yes', async () => {
      sinon.stub(SdkPreparePrompts.prototype, 'overwriteSdk').resolves(true);

      expect((await execute({ force: false })).getValue().kind).to.equal('record');
    });

    it('follows the warning about another generation, and no cancels there too', async () => {
      await recorded({ 'README.md': '# sdk' });
      const notForThis = sinon.stub(SdkPreparePrompts.prototype, 'recordNotForThisGeneration');
      const overwriteSdk = sinon.stub(SdkPreparePrompts.prototype, 'overwriteSdk').resolves(false);

      expect((await execute({ generation: BETA, force: false })).isCancelled()).to.be.true;
      expect(notForThis.calledBefore(overwriteSdk)).to.be.true;
    });

    it('is skipped by --force', async () => {
      const overwriteSdk = sinon.stub(SdkPreparePrompts.prototype, 'overwriteSdk');

      expect((await execute({ force: true })).getValue().kind).to.equal('record');
      expect(overwriteSdk.called).to.be.false;
    });
  });

  describe('sharing through the remote', () => {
    const sh = (cwd: string, ...args: string[]) =>
      execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd });

    /** The developer's project pushed to a bare origin, its snapshot shared, and a clone of it. */
    const shared = async (): Promise<{ clone: string; origin: string; base: CommitId }> => {
      const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-sdk-origin-'));
      const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-sdk-clone-'));
      const repository = await recorded({ 'README.md': '# sdk' });
      const base = (await repository.readRecord())!.pristineCommit();
      await sh(root, 'add', '.');
      await sh(root, 'commit', '-qm', 'sdk');
      await sh(root, 'init', '-q', '--bare', origin);
      await sh(root, 'remote', 'add', 'origin', origin);
      await sh(root, 'push', '-q', 'origin', 'main');
      await sh(root, 'push', '-q', 'origin', repository.pristineRef().refspec());
      await sh(root, 'clone', '-q', '--no-local', origin, clone);
      sdkContext = new SdkContext(Language.PYTHON, new DirectoryPath(path.join(clone, 'sdk')));
      return { clone, origin, base };
    };

    it('merges in a clone by itself, fetching the snapshot the origin shared', async () => {
      const { clone, origin, base } = await shared();
      try {
        const destination = (await execute()).getValue();

        expect(destination.kind === 'merge' && destination.base.isEqual(base)).to.be.true;
      } finally {
        fs.rmSync(clone, { recursive: true, force: true });
        fs.rmSync(origin, { recursive: true, force: true });
      }
    });
  });
});
