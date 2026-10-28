import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { errAsync, okAsync } from 'neverthrow';
import sinon from 'sinon';
import { GenerateAction } from '../../../src/actions/sdk/generate.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { MERGE_NEEDS_RESOLVING, SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { SdkContext } from '../../../src/types/sdk-context.js';
import { GENERATED_MARKER, YOURS_MARKER } from '../../../src/types/sdk/conflict-markers.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, SdkGeneration } from '../../../src/types/sdk/generation-record.js';
import { SdkPath } from '../../../src/types/sdk/sdk-path.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';
import { SdkRepositoryContext } from '../../../src/types/sdk-repository-context.js';
import { terminal } from '../../../src/utils/terminal-utils.js';
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';
import { describeCommit, snapshotFiles } from '../../helpers/snapshots.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };
const STABLE: SdkGeneration = {
  language: Language.PYTHON,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
};

const MODEL_V1 = [
  'class Book:',
  '    id: str',
  '    title: str',
  '    author: str',
  '    year: int',
  '    # Price in USD.',
  '    price: float',
  ''
].join('\n');
const MODEL_V2 = MODEL_V1.replace('# Price in USD.', '# Retail price in US dollars.') + '    isbn: str\n';
const DECORATED = 'from dataclasses import dataclass\n\n\n@dataclass\n';
const MODEL_V1_EDITED = MODEL_V1.replace('# Price in USD.', '# Price in USD, VAT included.');

const rel = (value: string) => RelativeFilePath.fromGit(value);

/** How the downloaded SDK lands in its directory: replaced, recorded, or merged over the developer's edits. */
describe('GenerateAction (sdk) — writing the SDK', () => {
  let root: string;
  let generates: (files: Files) => Promise<void>;
  const git = new GitService();

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));
  const sdkContext = () => new SdkContext(sdk());
  const at = (relative: string) => path.join(sdk().toString(), relative);
  const read = (relative: string) => fs.readFileSync(at(relative), 'utf-8');
  const record = () => GenerationRecord.parse(read('.apimatic/generation.json'))!;

  const execute = async (files: Files, force = true) => {
    await generates(files);
    return new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(root)),
      sdk(),
      Language.PYTHON,
      Stability.STABLE,
      force
    );
  };

  /** A first generation of `files`, written and recorded into the project's repository. */
  const recorded = async (files: Files): Promise<{ repository: SdkRepositoryContext; base: CommitId }> => {
    writeFiles(sdk().toString(), files);
    (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
    const repository = (await sdkContext().repository())._unsafeUnwrap()!;
    const tree = (await repository.snapshotGenerated(sdk()))._unsafeUnwrap();
    const written = (await repository.recordGeneration(tree, STABLE))._unsafeUnwrap();
    return { repository, base: written.pristineCommit() };
  };

  const fresh = () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-write-'));
    ({ generates } = stubSdkGeneration(root));
  };

  beforeEach(fresh);

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('overwrite', () => {
    it('replaces the directory with the generated files, keeping a .git and writing no record', async () => {
      sinon.stub(GitService.prototype, 'version').returns(okAsync(undefined));
      sinon.stub(SdkGeneratePrompts.prototype, 'gitUnavailable');
      writeFiles(sdk().toString(), { 'old.py': 'old', '.git/HEAD': 'ref: refs/heads/main' });
      const sdkGenerated = sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');

      expect((await execute({ 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(fs.readdirSync(sdk().toString()).sort()).to.deep.equal(['.git', 'README.md']);
      expect(sdkGenerated.firstCall.args[0].isEqual(sdk())).to.be.true;
    });
  });

  describe('record', () => {
    it('initialises a repository in the SDK directory when the developer says yes, says so, and records the snapshot', async () => {
      sinon.stub(terminal, 'isInteractive').returns(true);
      sinon.stub(SdkGeneratePrompts.prototype, 'createRepository').resolves(true);
      sinon.stub(SdkGeneratePrompts.prototype, 'shareHookInstalled');
      const repositoryInitialised = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');

      const result = await execute({ 'README.md': '# sdk', 'a.py': 'x' }, false);

      expect(result.isSuccess()).to.be.true;
      expect(repositoryInitialised.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(fs.readFileSync(at('.git/HEAD'), 'utf-8').trim()).to.equal('ref: refs/heads/main');
      const pristine = (await git.resolveRef(sdk(), SnapshotRef.pristine(SdkPath.fromGit(''))))._unsafeUnwrap()!;
      expect(record().pristineCommit().isEqual(pristine)).to.be.true;
      expect(record().isFor(STABLE)).to.be.true;
      const repository = (await sdkContext().repository())._unsafeUnwrap()!;
      const files = await snapshotFiles(repository.root(), pristine);
      expect([...files.keys()]).to.have.members(['README.md', 'a.py']);
    });

    it('records into the enclosing repository under the SDK directory’s ref, keeping what was there out of it', async () => {
      writeFiles(sdk().toString(), { 'old.py': 'old' });
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
      const repositoryInitialised = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');

      expect((await execute({ 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(repositoryInitialised.called).to.be.false;
      expect(fs.existsSync(at('.git'))).to.be.false;
      expect(fs.existsSync(at('old.py'))).to.be.false;
      const ref = SnapshotRef.pristine(SdkPath.fromGit('sdk/python'));
      expect((await git.resolveRef(new DirectoryPath(root), ref))._unsafeUnwrap()?.isEqual(record().pristineCommit()))
        .to.be.true;
    });

    it('still succeeds, with a warning, when the snapshot cannot be recorded', async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
      sinon
        .stub(SdkRepositoryContext.prototype, 'recordGeneration')
        .returns(errAsync({ kind: 'gitFailed', reason: 'git broke' }));
      const snapshotNotRecorded = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotNotRecorded');

      expect((await execute({ 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(read('README.md')).to.equal('# sdk');
      expect(snapshotNotRecorded.firstCall.args).to.deep.equal(['git broke']);
    });

    it('fails with its own message, writing nothing, when the SDK directory cannot be made a repository', async () => {
      sinon.stub(terminal, 'isInteractive').returns(true);
      sinon.stub(SdkGeneratePrompts.prototype, 'createRepository').resolves(true);
      sinon.stub(SdkContext.prototype, 'initRepository').returns(errAsync({ kind: 'gitFailed', reason: 'git broke' }));
      const notInitialised = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryNotInitialised');
      const customCodeFailed = sinon.stub(SdkGeneratePrompts.prototype, 'customCodeFailed');

      expect((await execute({ 'README.md': '# sdk' }, false)).isFailed()).to.be.true;

      expect(fs.existsSync(path.join(sdk().toString(), 'README.md'))).to.be.false;
      expect(notInitialised.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(notInitialised.firstCall.args[1]).to.equal('git broke');
      expect(customCodeFailed.called).to.be.false;
    });
  });

  describe('merge', () => {
    it('merges the generator’s changes into your edited files, adds new files and keeps your own', async () => {
      const { repository, base } = await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      writeFiles(sdk().toString(), { 'models/book.py': DECORATED + MODEL_V1, 'notes.txt': 'mine' });
      const sdkMerged = sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');

      const result = await execute({
        'README.md': '# sdk v2',
        'models/book.py': MODEL_V2,
        'models/author.py': 'class Author: ...'
      });

      expect(result.isSuccess()).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
      expect(read('README.md')).to.equal('# sdk v2');
      expect(read('models/author.py')).to.equal('class Author: ...');
      expect(read('notes.txt')).to.equal('mine');
      expect(
        Object.fromEntries(
          Object.entries(sdkMerged.firstCall.args[1].files).map(([kind, paths]) => [kind, paths.map(String)])
        )
      ).to.deep.include({
        added: ['models/author.py'],
        merged: ['models/book.py'],
        removed: [],
        kept: ['notes.txt']
      });
      expect(record().pristineCommit().isEqual(base)).to.be.false;
      expect((await describeCommit(repository.root(), record().pristineCommit())).parents).to.deep.equal([base]);
      const previous = (await git.resolveRef(repository.root(), repository.previousRef()))._unsafeUnwrap()!;
      const kept = await snapshotFiles(repository.root(), previous);
      expect(kept.get('models/book.py')).to.equal(DECORATED + MODEL_V1);
    });

    it('writes markers where you and the generator changed the same lines, lists the file and fails', async () => {
      const { repository } = await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      writeFiles(sdk().toString(), { 'models/book.py': MODEL_V1_EDITED });
      sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
      const conflicts = sinon.stub(SdkGeneratePrompts.prototype, 'conflicts');

      const result = await execute({ 'README.md': '# sdk v2', 'models/book.py': MODEL_V2 });

      expect(result.isFailed()).to.be.true;
      expect(result.getExitCode()).to.equal(1);
      expect(result.getMessage()).to.equal(MERGE_NEEDS_RESOLVING);
      expect(conflicts.firstCall.args[0].conflicts).to.deep.equal([
        { path: rel('models/book.py'), kind: 'bothChanged' }
      ]);
      expect(read('models/book.py')).to.contain(`${YOURS_MARKER}\n    # Price in USD, VAT included.\n=======\n`);
      expect(read('models/book.py')).to.contain('    # Retail price in US dollars.\n');
      expect(read('models/book.py')).to.contain(`${GENERATED_MARKER}\n`);
      expect(read('README.md')).to.equal('# sdk v2');
      expect(read('.apimatic/generation.json')).to.not.contain('conflicts');
      const cwd = repository.root().toString();
      expect((await execa('git', ['status', '--porcelain'], { cwd })).stdout).to.contain(
        'UU sdk/python/models/book.py'
      );
      const staged = (await execa('git', ['ls-files', '--stage', '--', 'sdk/python/models/book.py'], { cwd })).stdout;
      expect(staged.split('\n').map((line) => line.split(/\s+/)[2])).to.deep.equal(['1', '2', '3']);
    });

    it('still reports the conflicts when they cannot be marked in the index, with a warning', async () => {
      await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      writeFiles(sdk().toString(), { 'models/book.py': MODEL_V1_EDITED });
      sinon
        .stub(SdkRepositoryContext.prototype, 'stageConflicts')
        .returns(errAsync({ kind: 'gitFailed', reason: 'index locked' }));
      sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
      const conflictsNotStaged = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsNotStaged');
      const conflicts = sinon.stub(SdkGeneratePrompts.prototype, 'conflicts');

      const result = await execute({ 'models/book.py': MODEL_V2 });

      expect(result.isFailed()).to.be.true;
      expect(result.getMessage()).to.equal(MERGE_NEEDS_RESOLVING);
      expect(conflictsNotStaged.firstCall.args[0]).to.equal('index locked');
      expect(conflicts.called).to.be.true;
      expect(read('models/book.py')).to.contain(YOURS_MARKER);
    });

    it('puts the directory back and names the file when a write fails partway', async () => {
      const { base } = await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      writeFiles(sdk().toString(), { 'README.md': '# edited' });
      const real = fs.promises.writeFile;
      sinon
        .stub(fs.promises, 'writeFile')
        .callsFake((file, ...rest) =>
          String(file).endsWith('book.py')
            ? Promise.reject(new Error('EACCES: permission denied'))
            : real.call(fs.promises, file, ...rest)
        );
      const sdkNotWritten = sinon.stub(SdkGeneratePrompts.prototype, 'sdkNotWritten');

      expect((await execute({ 'README.md': '# sdk v2', 'models/book.py': MODEL_V2 })).isFailed()).to.be.true;

      expect(read('README.md')).to.equal('# edited');
      expect(read('models/book.py')).to.equal(MODEL_V1);
      expect(record().pristineCommit().isEqual(base)).to.be.true;
      const [where, problem] = sdkNotWritten.firstCall.args;
      expect(where.isEqual(sdk())).to.be.true;
      expect(problem.file.name().toString()).to.equal('book.py');
      expect(problem.undo).to.deep.equal({ kind: 'done' });
    });

    it('leaves the directory alone when the pre-run state cannot be kept', async () => {
      const { base } = await recorded({ 'README.md': '# sdk' });
      writeFiles(sdk().toString(), { 'README.md': '# edited' });
      sinon
        .stub(SdkRepositoryContext.prototype, 'savePrevious')
        .returns(errAsync({ kind: 'gitFailed', reason: 'git broke' }));
      const customCodeFailed = sinon.stub(SdkGeneratePrompts.prototype, 'customCodeFailed');

      expect((await execute({ 'README.md': '# sdk v2' })).isFailed()).to.be.true;

      expect(read('README.md')).to.equal('# edited');
      expect(record().pristineCommit().isEqual(base)).to.be.true;
      expect(customCodeFailed.firstCall.args[0]).to.equal('git broke');
    });
  });

  describe('the question when the merge conflicts', () => {
    const NEXT: Files = { 'README.md': '# sdk v2', 'models/book.py': MODEL_V2 };

    /** An edited model the generator also changed, so the merge conflicts on it, plus a clean change elsewhere. */
    const conflicting = async () => {
      const { repository, base } = await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      writeFiles(sdk().toString(), { 'models/book.py': DECORATED + MODEL_V1_EDITED, 'notes.txt': 'mine' });
      sinon.stub(terminal, 'isInteractive').returns(true);
      sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
      return { repository, base };
    };

    it('settles the overlapping hunks for the generator on request, keeping your other edits in the same file', async () => {
      const { repository } = await conflicting();
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('generated');
      const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      const result = await execute(NEXT, false);

      expect(result.isSuccess()).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
      expect(read('README.md')).to.equal('# sdk v2');
      expect(read('notes.txt')).to.equal('mine');
      expect(conflictsResolved.firstCall.args[0]).to.equal('generated');
      expect(conflictsResolved.firstCall.args[1].map(String)).to.deep.equal(['models/book.py']);
      const previous = (await git.resolveRef(repository.root(), repository.previousRef()))._unsafeUnwrap()!;
      expect((await snapshotFiles(repository.root(), previous)).get('models/book.py')).to.equal(
        DECORATED + MODEL_V1_EDITED
      );
    });

    it('keeps an edited file the generator stopped producing when settling for the generator', async () => {
      await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1, 'helpers/old.py': 'old' });
      writeFiles(sdk().toString(), { 'models/book.py': DECORATED + MODEL_V1_EDITED, 'helpers/old.py': 'old, edited' });
      sinon.stub(terminal, 'isInteractive').returns(true);
      sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('generated');
      const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      const result = await execute(NEXT, false);

      expect(result.isSuccess()).to.be.true;
      expect(read('helpers/old.py')).to.equal('old, edited');
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
      expect(conflictsResolved.firstCall.args[1].map(String)).to.have.members(['helpers/old.py', 'models/book.py']);
    });

    it('settles the overlapping hunks for you on request, with the generator’s other changes in the same file', async () => {
      await conflicting();
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('yours');
      const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      const result = await execute(NEXT, false);

      expect(result.isSuccess()).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED + '    isbn: str\n');
      expect(read('README.md')).to.equal('# sdk v2');
      expect(read('notes.txt')).to.equal('mine');
      expect(conflictsResolved.firstCall.args[0]).to.equal('yours');
      expect(conflictsResolved.firstCall.args[1].map(String)).to.deep.equal(['models/book.py']);
    });

    for (const [answer, how] of [
      ['cancel', 'cancels the run'],
      [undefined, 'backs out of the question']
    ] as const) {
      it(`writes nothing at all when the developer ${how}`, async () => {
        const { repository, base } = await conflicting();
        sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves(answer);
        const runCancelled = sinon.stub(SdkGeneratePrompts.prototype, 'runCancelled');

        const result = await execute(NEXT, false);

        expect(result.isCancelled()).to.be.true;
        expect(read('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
        expect(read('README.md')).to.equal('# sdk');
        expect(record().pristineCommit().isEqual(base)).to.be.true;
        expect((await git.resolveRef(repository.root(), repository.previousRef()))._unsafeUnwrap()).to.be.undefined;
        expect(runCancelled.calledOnce).to.be.true;
      });
    }

    it('leaves markers when the developer will resolve, with the steps but not the list again', async () => {
      await conflicting();
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('resolve');
      const conflictSteps = sinon.stub(SdkGeneratePrompts.prototype, 'conflictSteps');
      const conflicts = sinon.stub(SdkGeneratePrompts.prototype, 'conflicts');

      const result = await execute(NEXT, false);

      expect(result.isFailed()).to.be.true;
      expect(read('models/book.py')).to.contain(YOURS_MARKER);
      expect(conflictSteps.calledOnce).to.be.true;
      expect(conflicts.called).to.be.false;
    });

    for (const [how, tty, force] of [
      ['without a terminal', false, false],
      ['with --force', true, true]
    ] as const) {
      it(`does not ask ${how}: markers, the list and the steps`, async () => {
        await conflicting();
        (terminal.isInteractive as sinon.SinonStub).returns(tty);
        const conflictChoice = sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice');
        const conflicts = sinon.stub(SdkGeneratePrompts.prototype, 'conflicts');

        const result = await execute(NEXT, force);

        expect(result.isFailed()).to.be.true;
        expect(conflictChoice.called).to.be.false;
        expect(conflicts.calledOnce).to.be.true;
        expect(read('models/book.py')).to.contain(YOURS_MARKER);
      });
    }
  });

  describe('the hook that shares snapshots', () => {
    beforeEach(async () => {
      (await git.init(new DirectoryPath(root)))._unsafeUnwrap();
    });

    const recordOne = () => execute({ 'README.md': '# sdk' });

    it('is installed after recording, and announced once, when its file is written', async () => {
      const file = new FilePath(new DirectoryPath(root), new FileName('pre-push'));
      const install = sinon.stub(SdkRepositoryContext.prototype, 'installShareHook');
      install.onFirstCall().returns(okAsync({ kind: 'installed', file, written: true }));
      install.onSecondCall().returns(okAsync({ kind: 'installed', file, written: false }));
      const shareHookInstalled = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookInstalled');
      const shareHookNeedsOneStep = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNeedsOneStep');
      const shareHookNotInstalled = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNotInstalled');

      expect((await recordOne()).isSuccess()).to.be.true;
      expect((await recordOne()).isSuccess()).to.be.true;

      expect(install.calledTwice).to.be.true;
      expect(shareHookInstalled.calledOnce).to.be.true;
      expect(shareHookInstalled.firstCall.args[0]).to.equal(file);
      expect(shareHookNeedsOneStep.called).to.be.false;
      expect(shareHookNotInstalled.called).to.be.false;
    });

    it('shows the one step when git runs hooks from elsewhere, and still succeeds', async () => {
      const file = new FilePath(new DirectoryPath(root), new FileName('pre-push'));
      const script = new FilePath(new DirectoryPath(root), new FileName('apimatic-pre-push'));
      const needed = { kind: 'elsewhere' as const, file, hooksPath: '.husky/_', inRepository: true, script };
      sinon.stub(SdkRepositoryContext.prototype, 'installShareHook').returns(okAsync(needed));
      const shareHookNeedsOneStep = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNeedsOneStep');

      expect((await recordOne()).isSuccess()).to.be.true;

      expect(shareHookNeedsOneStep.firstCall.args[0]).to.equal(needed);
    });

    it('warns when the hook cannot be written, and still succeeds', async () => {
      sinon
        .stub(SdkRepositoryContext.prototype, 'installShareHook')
        .returns(errAsync({ kind: 'fileFailed', reason: 'EACCES: permission denied' }));
      const shareHookNotInstalled = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNotInstalled');

      expect((await recordOne()).isSuccess()).to.be.true;

      expect(shareHookNotInstalled.firstCall.args[0]).to.equal('EACCES: permission denied');
    });
  });
});
