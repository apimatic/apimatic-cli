import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import { GenerateAction } from '../../../src/actions/sdk/generate.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { canonical } from '../../../src/infrastructure/tmp-extensions.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, recordContents } from '../../../src/types/sdk/generation-record.js';
import { leftUnmerged } from '../../helpers/merge.js';
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';
import { describeCommit, snapshotFiles } from '../../helpers/snapshots.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };
const GENERATED: Files = { 'README.md': '# sdk' };
/** Where the SDK directory's own repository keeps each generation as the server returned it. */
const PRISTINE_REF = 'refs/apimatic/pristine';
const RECORD = '.apimatic/generation.json';

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
  const entries = () => fs.readdirSync(sdk().toString()).sort();
  /** The commit the pristine ref names in the SDK directory's own repository, or none. */
  const pristine = async () => (await git.resolveRef(sdk(), PRISTINE_REF))._unsafeUnwrap();
  /** The record the last run left in the SDK directory. */
  const record = () => GenerationRecord.parse(read(RECORD));
  const refsIn = async (cwd: string) => (await execa('git', ['for-each-ref', 'refs/apimatic'], { cwd })).stdout;
  const gitInitSteps = () => SdkGeneratePrompts.prototype.gitInitSteps as sinon.SinonStub;
  const repositoryFound = () => SdkGeneratePrompts.prototype.repositoryFound as sinon.SinonStub;

  const execute = async (
    options: { force?: boolean; canAsk?: boolean; gitInit?: boolean; stability?: Stability; files?: Files } = {}
  ) => {
    await generates(options.files ?? GENERATED);
    return new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(root)),
      sdk(),
      Language.PYTHON,
      options.stability ?? Stability.STABLE,
      options.force ?? true,
      options.canAsk ?? false,
      options.gitInit ?? false
    );
  };

  /** The SDK directory as a repository of its own, with nothing recorded in it yet. */
  const ownRepository = async () => {
    fs.mkdirSync(sdk().toString(), { recursive: true });
    (await git.init(sdk()))._unsafeUnwrap();
  };

  /** The SDK directory as a repository of its own with one generation recorded in it, as a run with --git-init leaves it. */
  const recorded = async (files: Files = GENERATED) => {
    expect((await execute({ gitInit: true, files })).isSuccess()).to.be.true;
    return (await pristine())!;
  };

  beforeEach(() => {
    root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-destination-')));
    ({ generates, generateSdk } = stubSdkGeneration(root));
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryFound');
    sinon.stub(SdkGeneratePrompts.prototype, 'gitInitSteps');
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('with a git that cannot serve the feature', () => {
    for (const [found, unavailable, versionNamed] of [
      [
        'no git, or one that does not answer',
        () => {
          sinon.stub(GitService.prototype, 'version').resolves(GitVersion.none());
          return sinon.stub(SdkGeneratePrompts.prototype, 'gitUnavailable');
        },
        undefined
      ],
      [
        'an older git',
        () => {
          sinon.stub(GitService.prototype, 'version').resolves(GitVersion.parse('git version 2.30.2'));
          return sinon.stub(SdkGeneratePrompts.prototype, 'gitVersionNotSupported');
        },
        '2.30.2'
      ]
    ] as const) {
      it(`with ${found} and --git-init, warns that customizations will not persist and overwrites, without the steps`, async () => {
        const warned = unavailable();

        expect((await execute({ gitInit: true })).isSuccess()).to.be.true;

        expect(warned.calledOnce).to.be.true;
        expect(warned.firstCall.args[0]?.toString()).to.equal(versionNamed);
        expect(entries()).to.deep.equal(['README.md']);
        expect(gitInitSteps().called).to.be.false;
      });

      it(`with ${found}, warns and overwrites the SDK directory's own repository, keeping its .git`, async () => {
        await ownRepository();
        const warned = unavailable();

        expect((await execute()).isSuccess()).to.be.true;

        expect(warned.calledOnce).to.be.true;
        expect(entries()).to.deep.equal(['.git', 'README.md']);
      });
    }
  });

  it('does not look for git without a repository of its own or --git-init, and warns about a missing one only once it does', async () => {
    const version = sinon.stub(GitService.prototype, 'version').resolves(GitVersion.none());
    const gitUnavailable = sinon.stub(SdkGeneratePrompts.prototype, 'gitUnavailable');

    expect((await execute()).isSuccess()).to.be.true;
    expect(version.called).to.be.false;
    expect(gitInitSteps().calledOnce).to.be.true;

    expect((await execute({ gitInit: true })).isSuccess()).to.be.true;
    expect(gitUnavailable.calledOnce).to.be.true;
    expect(fs.existsSync(at('.git'))).to.be.false;
    expect(gitInitSteps().calledOnce).to.be.true;
  });

  describe('when the SDK directory is not a repository of its own', () => {
    for (const [how, canAsk, force] of [
      ['in a terminal', true, false],
      ['without a terminal', false, false],
      ['with --force', true, true]
    ] as const) {
      it(`makes it one with --git-init and records into it, ${how}`, async () => {
        const repositoryInitialised = SdkGeneratePrompts.prototype.repositoryInitialised as sinon.SinonStub;

        expect((await execute({ force, canAsk, gitInit: true })).isSuccess()).to.be.true;

        expect(repositoryInitialised.firstCall.args[0].isEqual(sdk())).to.be.true;
        expect(repositoryFound().called).to.be.false;
        expect(fs.readFileSync(at('.git/HEAD'), 'utf-8').trim()).to.equal('ref: refs/heads/main');
        const snapshot = await pristine();
        expect(snapshot).to.not.be.undefined;
        expect([...(await snapshotFiles(sdk(), snapshot!)).keys()]).to.deep.equal(['README.md']);
        expect(record().baseFor(Language.PYTHON, Stability.STABLE)).to.deep.equal(snapshot);
      });

      it(`writes the SDK without a repository otherwise, then gives the steps that keep edits, ${how}`, async () => {
        expect((await execute({ force, canAsk })).isSuccess()).to.be.true;

        expect(gitInitSteps().firstCall.args[0].isEqual(sdk())).to.be.true;
        expect(gitInitSteps().calledAfter(SdkGeneratePrompts.prototype.sdkGenerated as sinon.SinonStub)).to.be.true;
        expect(entries()).to.deep.equal(['README.md']);
      });
    }

    it('leaves a project repository that only encloses it alone', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();

      expect((await execute()).isSuccess()).to.be.true;

      expect(gitInitSteps().calledOnce).to.be.true;
      expect(fs.existsSync(at('.git'))).to.be.false;
      expect(await refsIn(root)).to.equal('');
    });

    it('makes it a repository inside the project repository with --git-init, keeping the snapshots there', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();

      expect((await execute({ gitInit: true })).isSuccess()).to.be.true;

      expect(await pristine()).to.not.be.undefined;
      expect(await refsIn(root)).to.equal('');
    });

    it('fails with its own message, writing nothing, when the SDK directory cannot be made a repository', async () => {
      sinon.stub(GitService.prototype, 'init').resolves(err('git broke'));
      const notInitialised = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryNotInitialised');

      expect((await execute({ gitInit: true })).isFailed()).to.be.true;

      expect(fs.existsSync(at('README.md'))).to.be.false;
      expect(notInitialised.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(notInitialised.firstCall.args[1]).to.equal('git broke');
    });
  });

  describe('when the SDK directory is a repository of its own', () => {
    it('records into it, saying it found it, and keeps what was there out of the snapshot', async () => {
      await ownRepository();
      write('old.py', 'old');
      const repositoryInitialised = SdkGeneratePrompts.prototype.repositoryInitialised as sinon.SinonStub;

      expect((await execute()).isSuccess()).to.be.true;

      expect(repositoryInitialised.called).to.be.false;
      expect(repositoryFound().firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(entries()).to.deep.equal(['.apimatic', '.git', 'README.md']);
      expect([...(await snapshotFiles(sdk(), (await pristine())!)).keys()]).to.deep.equal(['README.md']);
      expect(gitInitSteps().called).to.be.false;
    });

    it('chains the next generation onto the last snapshot, so each run has the one before as its base, saying found only the first time', async () => {
      const first = await recorded();

      expect((await execute({ files: { 'README.md': '# sdk v2' } })).isSuccess()).to.be.true;

      const second = (await pristine())!;
      expect((await describeCommit(sdk(), second)).parents).to.deep.equal([first]);
      expect(read('README.md')).to.equal('# sdk v2');
      expect(record().baseFor(Language.PYTHON, Stability.STABLE)).to.deep.equal(second);
      expect(repositoryFound().called).to.be.false;
    });

    it('records afresh over an SDK generated at another stability, without a word', async () => {
      const first = await recorded();
      const snapshotMissing = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');

      expect((await execute({ stability: Stability.BETA, files: { 'README.md': '# beta' } })).isSuccess()).to.be.true;

      expect(repositoryFound().called).to.be.false;
      expect(snapshotMissing.called).to.be.false;
      expect(record().baseFor(Language.PYTHON, Stability.STABLE)).to.be.undefined;
      expect((await describeCommit(sdk(), record().baseFor(Language.PYTHON, Stability.BETA)!)).parents).to.deep.equal([
        first
      ]);
    });

    it('warns when the recorded snapshot is not in the repository, then records afresh', async () => {
      await recorded();
      const missing = CommitId.fromGit('f'.repeat(40))!;
      write(RECORD, recordContents(Language.PYTHON, Stability.STABLE, missing));
      const snapshotMissing = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');

      expect((await execute()).isSuccess()).to.be.true;

      expect(snapshotMissing.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(repositoryFound().called).to.be.false;
      expect(record().baseFor(Language.PYTHON, Stability.STABLE)).to.deep.equal(await pristine());
    });

    it('still succeeds, with a warning, when the snapshot cannot be recorded', async () => {
      await ownRepository();
      sinon.stub(GitService.prototype, 'commitTree').resolves(err('git broke'));
      const snapshotNotRecorded = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotNotRecorded');

      expect((await execute()).isSuccess()).to.be.true;

      expect(read('README.md')).to.equal('# sdk');
      expect(snapshotNotRecorded.firstCall.args).to.deep.equal(['git broke']);
    });

    for (const [what, prepare, breaks] of [
      ['the repository', ownRepository, () => sinon.stub(GitService.prototype, 'topLevel').resolves(err('git broke'))],
      [
        'the snapshot the record names',
        recorded,
        () => sinon.stub(GitService.prototype, 'hasCommit').resolves(err('git broke'))
      ]
    ] as const) {
      it(`reports a git that will not say what ${what} is, before generating`, async () => {
        await prepare();
        breaks();
        const notInspected = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryNotInspected');
        generateSdk.resetHistory();

        expect((await execute()).isFailed()).to.be.true;

        expect(notInspected.firstCall.args[0].isEqual(sdk())).to.be.true;
        expect(notInspected.firstCall.args[1]).to.equal('git broke');
        expect(generateSdk.called).to.be.false;
      });
    }
  });

  describe('what the last run left', () => {
    const MARKED = '<<<<<<< Your changes\nmine\n=======\ntheirs\n>>>>>>> Generated by APIMatic\n';
    const FILES: Files = { 'README.md': '# sdk', 'a.py': 'generated' };
    const NEXT: Files = { 'README.md': '# sdk v2', 'a.py': 'generated' };

    /** A recorded generation whose `a.py` the developer left unmerged, with markers, beside a file resolved by hand. */
    const leftMarked = async () => {
      await recorded(FILES);
      write('a.py', 'kept above\n' + MARKED + 'kept below\n');
      write('b.py', 'resolved by hand');
      await leftUnmerged(sdk(), 'a.py');
    };

    it('ends as Action required without a terminal while git holds a file of the SDK as unmerged', async () => {
      await leftMarked();
      const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

      expect((await execute({ force: false })).isActionRequired()).to.be.true;

      const [directory, paths] = conflictsUnresolved.firstCall.args;
      expect(directory.isEqual(sdk())).to.be.true;
      expect(paths.map(String)).to.deep.equal(['a.py']);
      expect(generateSdk.calledOnce).to.be.true;
    });

    it('refuses an unmerged file before looking at the record, so another stability or no record cannot write over it', async () => {
      await leftMarked();
      const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

      expect((await execute({ stability: Stability.BETA, force: false })).isActionRequired()).to.be.true;
      fs.rmSync(at('.apimatic'), { recursive: true });
      expect((await execute({ force: false })).isActionRequired()).to.be.true;

      expect(conflictsUnresolved.callCount).to.equal(2);
      expect(read('a.py')).to.contain('<<<<<<< Your changes');
      expect(generateSdk.calledOnce).to.be.true;
    });

    it('refuses while the repository is in the middle of a merge of the developer’s own', async () => {
      await recorded();
      fs.writeFileSync(at('.git/MERGE_HEAD'), `${'a'.repeat(40)}\n`);
      const operationInProgress = sinon.stub(SdkGeneratePrompts.prototype, 'operationInProgress');

      expect((await execute()).isFailed()).to.be.true;

      const [directory, operation] = operationInProgress.firstCall.args;
      expect(directory.isEqual(sdk())).to.be.true;
      expect(operation.toString()).to.equal('merge');
      expect(generateSdk.calledOnce).to.be.true;
    });

    describe('the question while the last run’s conflicts are unresolved', () => {
      it('settles the markers still there for the generator, keeping the rest of the file, then merges', async () => {
        await leftMarked();
        sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves('generated');
        const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');
        const sdkMerged = sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');

        expect((await execute({ force: false, canAsk: true, files: NEXT })).isSuccess()).to.be.true;

        expect(read('a.py')).to.equal('kept above\ntheirs\nkept below\n');
        expect(read('b.py')).to.equal('resolved by hand');
        expect(read('README.md')).to.equal('# sdk v2');
        const [directory, side, paths] = conflictsResolved.firstCall.args;
        expect(directory.isEqual(sdk())).to.be.true;
        expect(side).to.equal('generated');
        expect(paths.map(String)).to.deep.equal(['a.py']);
        expect(sdkMerged.calledOnce).to.be.true;
      });

      it('settles the markers still there for you, keeping the rest of the file, then merges', async () => {
        await leftMarked();
        sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves('yours');
        const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');
        sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');

        expect((await execute({ force: false, canAsk: true, files: NEXT })).isSuccess()).to.be.true;

        expect(read('a.py')).to.equal('kept above\nmine\nkept below\n');
        expect(read('b.py')).to.equal('resolved by hand');
        expect(read('README.md')).to.equal('# sdk v2');
        expect(conflictsResolved.firstCall.args[1]).to.equal('yours');
      });

      it('ends as Action required, touching nothing, when the developer will finish resolving', async () => {
        await leftMarked();
        sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves('resolve');
        const resolveLater = sinon.stub(SdkGeneratePrompts.prototype, 'resolveLater');

        expect((await execute({ force: false, canAsk: true, files: NEXT })).isActionRequired()).to.be.true;

        expect(read('a.py')).to.equal('kept above\n' + MARKED + 'kept below\n');
        expect(resolveLater.calledOnce).to.be.true;
        expect(generateSdk.calledOnce).to.be.true;
      });

      it('cancels, touching nothing, when the developer backs out of the question', async () => {
        await leftMarked();
        sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice').resolves('cancel');
        const resolveLater = sinon.stub(SdkGeneratePrompts.prototype, 'resolveLater');

        expect((await execute({ force: false, canAsk: true, files: NEXT })).isCancelled()).to.be.true;

        expect(read('a.py')).to.equal('kept above\n' + MARKED + 'kept below\n');
        expect(resolveLater.calledOnce).to.be.true;
        expect(generateSdk.calledOnce).to.be.true;
      });

      it('settles them for the generator without asking under --force, then merges', async () => {
        await leftMarked();
        const unresolvedChoice = sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice');
        const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');
        sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');

        expect((await execute({ force: true, files: NEXT })).isSuccess()).to.be.true;

        expect(unresolvedChoice.called).to.be.false;
        expect(read('a.py')).to.equal('kept above\ntheirs\nkept below\n');
        expect(conflictsResolved.firstCall.args[1]).to.equal('generated');
      });

      it('does not ask without a terminal, and ends as Action required', async () => {
        await leftMarked();
        const unresolvedChoice = sinon.stub(SdkGeneratePrompts.prototype, 'unresolvedChoice');
        const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

        expect((await execute({ force: false })).isActionRequired()).to.be.true;

        expect(unresolvedChoice.called).to.be.false;
        expect(conflictsUnresolved.calledOnce).to.be.true;
      });

      it('fails with its own message when the files could not be settled', async () => {
        await leftMarked();
        sinon.stub(GitService.prototype, 'unstage').resolves(err('git broke'));
        const conflictsNotSettled = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsNotSettled');

        expect((await execute({ force: true, files: NEXT })).isFailed()).to.be.true;

        expect(conflictsNotSettled.firstCall.args).to.deep.equal(['git broke']);
        expect(generateSdk.calledOnce).to.be.true;
      });

      it('ends as Action required when a file is still unmerged once the settling is done', async () => {
        await leftMarked();
        sinon.stub(GitService.prototype, 'unstage').resolves(ok(undefined));
        sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');
        const conflictsUnresolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsUnresolved');

        expect((await execute({ force: true, files: NEXT })).isActionRequired()).to.be.true;

        expect(conflictsUnresolved.firstCall.args[1].map(String)).to.deep.equal(['a.py']);
        expect(read('a.py')).to.equal('kept above\ntheirs\nkept below\n');
        expect(generateSdk.calledOnce).to.be.true;
      });
    });
  });
});
