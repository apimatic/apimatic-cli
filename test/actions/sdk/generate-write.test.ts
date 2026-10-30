import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import {
  GENERATED_MARKER,
  GenerateAction,
  recordGeneratedDirectory,
  YOURS_MARKER
} from '../../../src/actions/sdk/generate.js';
import { FileService } from '../../../src/infrastructure/file-service.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord } from '../../../src/types/sdk/generation-record.js';
import { SdkGeneration } from '../../../src/types/sdk/sdk-generation.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';
import { terminal } from '../../../src/infrastructure/terminal.js';
import { Files, runMode, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';
import { describeCommit, repositoryOf, snapshotFiles } from '../../helpers/snapshots.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };
const STABLE = SdkGeneration.create({
  language: Language.PYTHON,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
})!;

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

const rel = (value: string) => RelativeFilePath.fromGit(value)!;

/** How the downloaded SDK lands in its directory: replaced, recorded, or merged over the developer's edits. */
describe('GenerateAction (sdk) — writing the SDK', () => {
  let root: string;
  let generates: (files: Files) => Promise<void>;
  const git = new GitService();

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));
  const previousRef = SnapshotRef.previous();
  const pristineRef = SnapshotRef.pristine();
  const at = (relative: string) => path.join(sdk().toString(), relative);
  const read = (relative: string) => fs.readFileSync(at(relative), 'utf-8');
  const record = () => GenerationRecord.parse(read('.apimatic/generation.json'))!;

  const execute = async (files: Files, force = true, gitInit = false) => {
    await generates(files);
    return new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(root)),
      sdk(),
      { language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.STABLE },
      runMode(force, gitInit)
    );
  };

  /** A first generation of `files`, written and recorded into the SDK directory's own repository. */
  const recorded = async (files: Files): Promise<{ repository: DirectoryPath; base: CommitId }> => {
    writeFiles(sdk().toString(), files);
    (await git.init(sdk()))._unsafeUnwrap();
    const repository = (await repositoryOf(sdk(), STABLE))!;
    (await recordGeneratedDirectory(repository, sdk(), STABLE))._unsafeUnwrap();
    return { repository, base: (await git.resolveRef(sdk(), pristineRef))._unsafeUnwrap()! };
  };

  /** The SDK directory as a repository of its own, with nothing recorded in it yet. */
  const ownRepository = async () => {
    fs.mkdirSync(sdk().toString(), { recursive: true });
    (await git.init(sdk()))._unsafeUnwrap();
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
      sinon.stub(GitService.prototype, 'version').resolves(ok(undefined));
      sinon.stub(SdkGeneratePrompts.prototype, 'gitUnavailable');
      writeFiles(sdk().toString(), { 'old.py': 'old', '.git/HEAD': 'ref: refs/heads/main' });
      const sdkGenerated = sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');

      expect((await execute({ 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(fs.readdirSync(sdk().toString()).sort()).to.deep.equal(['.git', 'README.md']);
      expect(sdkGenerated.firstCall.args[0].isEqual(sdk())).to.be.true;
    });
  });

  describe('record', () => {
    it('initialises a repository in the SDK directory with --git-init, says so, and records the snapshot', async () => {
      sinon.stub(SdkGeneratePrompts.prototype, 'shareHookInstalled');
      const repositoryInitialised = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');

      const result = await execute({ 'README.md': '# sdk', 'a.py': 'x' }, true, true);

      expect(result.isSuccess()).to.be.true;
      expect(repositoryInitialised.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(fs.readFileSync(at('.git/HEAD'), 'utf-8').trim()).to.equal('ref: refs/heads/main');
      const pristine = (await git.resolveRef(sdk(), pristineRef))._unsafeUnwrap()!;
      expect(record().pristineCommit()).to.deep.equal(pristine);
      expect(record().isFor(STABLE)).to.be.true;
      const files = await snapshotFiles(sdk(), pristine);
      expect([...files.keys()]).to.have.members(['README.md', 'a.py']);
    });

    it('records into the SDK directory’s own repository, saying it found it, and keeps what was there out of it', async () => {
      await ownRepository();
      writeFiles(sdk().toString(), { 'old.py': 'old' });
      const repositoryInitialised = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
      const repositoryFound = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryFound');

      expect((await execute({ 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(repositoryInitialised.called).to.be.false;
      expect(repositoryFound.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(fs.existsSync(at('old.py'))).to.be.false;
      expect((await git.resolveRef(sdk(), pristineRef))._unsafeUnwrap()).to.deep.equal(record().pristineCommit());
    });

    it('still succeeds, with a warning, when the snapshot cannot be recorded', async () => {
      await ownRepository();
      sinon.stub(SdkGeneratePrompts.prototype, 'repositoryFound');
      sinon.stub(GitService.prototype, 'commitTree').resolves(err({ reason: 'git broke' }));
      const snapshotNotRecorded = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotNotRecorded');

      expect((await execute({ 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(read('README.md')).to.equal('# sdk');
      expect(snapshotNotRecorded.firstCall.args).to.deep.equal([{ reason: 'git broke' }]);
    });

    it('fails with its own message, writing nothing, when the SDK directory cannot be made a repository', async () => {
      sinon.stub(GitService.prototype, 'init').resolves(err({ reason: 'git broke' }));
      const notInitialised = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryNotInitialised');
      const customCodeFailed = sinon.stub(SdkGeneratePrompts.prototype, 'customCodeFailed');

      expect((await execute({ 'README.md': '# sdk' }, true, true)).isFailed()).to.be.true;

      expect(fs.existsSync(path.join(sdk().toString(), 'README.md'))).to.be.false;
      expect(notInitialised.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(notInitialised.firstCall.args[1]).to.deep.equal({ reason: 'git broke' });
      expect(customCodeFailed.called).to.be.false;
    });
  });

  describe('merge', () => {
    it('merges the generator’s changes into your edited files, adds new files and keeps your own', async () => {
      const { base } = await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
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
      expect(record().pristineCommit()).to.not.deep.equal(base);
      expect((await describeCommit(sdk(), record().pristineCommit())).parents).to.deep.equal([base]);
      const previous = (await git.resolveRef(sdk(), previousRef))._unsafeUnwrap()!;
      const kept = await snapshotFiles(sdk(), previous);
      expect(kept.get('models/book.py')).to.equal(DECORATED + MODEL_V1);
    });

    it('writes markers where you and the generator changed the same lines when you will resolve them, for a merge tool to find', async () => {
      await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      writeFiles(sdk().toString(), { 'models/book.py': MODEL_V1_EDITED });
      sinon.stub(terminal, 'isInteractive').returns(true);
      sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('resolve');
      const conflictSteps = sinon.stub(SdkGeneratePrompts.prototype, 'conflictSteps');

      const result = await execute({ 'README.md': '# sdk v2', 'models/book.py': MODEL_V2 }, false);

      expect(result.isActionRequired()).to.be.true;
      const [plan, where, staged] = conflictSteps.firstCall.args;
      expect(plan.conflicts).to.deep.equal([{ path: rel('models/book.py'), kind: 'bothChanged' }]);
      expect(where.isEqual(sdk())).to.be.true;
      expect(staged).to.be.true;
      expect(read('models/book.py')).to.contain(`${YOURS_MARKER}\n    # Price in USD, VAT included.\n=======\n`);
      expect(read('models/book.py')).to.contain('    # Retail price in US dollars.\n');
      expect(read('models/book.py')).to.contain(`${GENERATED_MARKER}\n`);
      expect(read('README.md')).to.equal('# sdk v2');
      expect(read('.apimatic/generation.json')).to.not.contain('conflicts');
      const cwd = sdk().toString();
      expect((await execa('git', ['status', '--porcelain'], { cwd })).stdout).to.contain('UU models/book.py');
      const stages = (await execa('git', ['ls-files', '--stage', '--', 'models/book.py'], { cwd })).stdout;
      expect(stages.split('\n').map((line) => line.split(/\s+/)[2])).to.deep.equal(['1', '2', '3']);
    });

    it('leaves the merge tool out of the steps when the conflicts cannot be marked in the index, with a warning', async () => {
      await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      writeFiles(sdk().toString(), { 'models/book.py': MODEL_V1_EDITED });
      sinon.stub(terminal, 'isInteractive').returns(true);
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('resolve');
      sinon.stub(GitService.prototype, 'stageConflicts').resolves(err({ reason: 'index locked' }));
      sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
      const conflictsNotStaged = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsNotStaged');
      const conflictSteps = sinon.stub(SdkGeneratePrompts.prototype, 'conflictSteps');

      const result = await execute({ 'models/book.py': MODEL_V2 }, false);

      expect(result.isActionRequired()).to.be.true;
      expect(conflictsNotStaged.firstCall.args[0]).to.deep.equal({ reason: 'index locked' });
      expect(conflictSteps.firstCall.args[2]).to.be.false;
      expect(read('models/book.py')).to.contain(YOURS_MARKER);
    });

    it('puts the directory back and names the file when a write fails partway', async () => {
      const { base } = await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      writeFiles(sdk().toString(), { 'README.md': '# edited' });
      const real = FileService.prototype.writeBytes;
      sinon.stub(FileService.prototype, 'writeBytes').callsFake(function (this: FileService, file, content) {
        return file.toString().endsWith('book.py')
          ? Promise.reject(new Error('EACCES: permission denied'))
          : real.call(this, file, content);
      });
      const sdkNotWritten = sinon.stub(SdkGeneratePrompts.prototype, 'sdkNotWritten');

      expect((await execute({ 'README.md': '# sdk v2', 'models/book.py': MODEL_V2 })).isFailed()).to.be.true;

      expect(read('README.md')).to.equal('# edited');
      expect(read('models/book.py')).to.equal(MODEL_V1);
      expect(record().pristineCommit()).to.deep.equal(base);
      const [where, problem] = sdkNotWritten.firstCall.args;
      expect(where.isEqual(sdk())).to.be.true;
      expect(problem.file.name().toString()).to.equal('book.py');
      expect(problem.undo).to.deep.equal({ kind: 'done' });
    });

    it('leaves the directory alone when the pre-run state cannot be kept', async () => {
      const { base } = await recorded({ 'README.md': '# sdk' });
      writeFiles(sdk().toString(), { 'README.md': '# edited' });
      const real = GitService.prototype.commitTree;
      sinon
        .stub(GitService.prototype, 'commitTree')
        .callsFake(function (this: GitService, root, tree, parents, message) {
          return message === 'apimatic: before regeneration'
            ? Promise.resolve(err({ reason: 'git broke' }))
            : real.call(this, root, tree, parents, message);
        });
      const customCodeFailed = sinon.stub(SdkGeneratePrompts.prototype, 'customCodeFailed');

      expect((await execute({ 'README.md': '# sdk v2' })).isFailed()).to.be.true;

      expect(read('README.md')).to.equal('# edited');
      expect(record().pristineCommit()).to.deep.equal(base);
      expect(customCodeFailed.firstCall.args[0]).to.deep.equal({ reason: 'git broke' });
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
      await conflicting();
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('generated');
      const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      const result = await execute(NEXT, false);

      expect(result.isSuccess()).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
      expect(read('README.md')).to.equal('# sdk v2');
      expect(read('notes.txt')).to.equal('mine');
      expect(conflictsResolved.firstCall.args[0]).to.equal('generated');
      expect(conflictsResolved.firstCall.args[1].map(String)).to.deep.equal(['models/book.py']);
      const previous = (await git.resolveRef(sdk(), previousRef))._unsafeUnwrap()!;
      expect((await snapshotFiles(sdk(), previous)).get('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
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
      ['cancel', 'backs out of the question']
    ] as const) {
      it(`writes nothing at all when the developer ${how}`, async () => {
        const { base } = await conflicting();
        sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves(answer);
        const runCancelled = sinon.stub(SdkGeneratePrompts.prototype, 'runCancelled');

        const result = await execute(NEXT, false);

        expect(result.isCancelled()).to.be.true;
        expect(read('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
        expect(read('README.md')).to.equal('# sdk');
        expect(record().pristineCommit()).to.deep.equal(base);
        expect((await git.resolveRef(sdk(), previousRef))._unsafeUnwrap()).to.be.undefined;
        expect(runCancelled.calledOnce).to.be.true;
      });
    }

    it('leaves markers when the developer will resolve, and ends as Action required with the steps', async () => {
      await conflicting();
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('resolve');
      const conflictSteps = sinon.stub(SdkGeneratePrompts.prototype, 'conflictSteps');

      const result = await execute(NEXT, false);

      expect(result.isActionRequired()).to.be.true;
      expect(read('models/book.py')).to.contain(YOURS_MARKER);
      expect(conflictSteps.calledOnce).to.be.true;
    });

    it('does not ask with --force, and settles the overlapping hunks for the generator', async () => {
      await conflicting();
      const conflictChoice = sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice');
      const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      const result = await execute(NEXT, true);

      expect(result.isSuccess()).to.be.true;
      expect(conflictChoice.called).to.be.false;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
      expect(read('notes.txt')).to.equal('mine');
      expect(conflictsResolved.firstCall.args[0]).to.equal('generated');
      expect(conflictsResolved.firstCall.args[1].map(String)).to.deep.equal(['models/book.py']);
    });

    it('refuses without a terminal, naming the conflicts, and writes nothing', async () => {
      await conflicting();
      (terminal.isInteractive as sinon.SinonStub).returns(false);
      const conflictChoice = sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice');
      const conflictsNotAsked = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsNotAsked');

      const result = await execute(NEXT, false);

      expect(result.isFailed()).to.be.true;
      expect(conflictChoice.called).to.be.false;
      expect(conflictsNotAsked.firstCall.args[0].conflicts.map((conflict) => String(conflict.path))).to.deep.equal([
        'models/book.py'
      ]);
      expect(read('models/book.py')).to.not.contain(YOURS_MARKER);
    });
  });

  describe('the hook that shares snapshots', () => {
    // A developer's own `core.hooksPath`, set globally, would move every hook these tests write.
    let globalConfig: string | undefined;

    beforeEach(async () => {
      globalConfig = process.env.GIT_CONFIG_GLOBAL;
      const empty = path.join(root, 'gitconfig');
      fs.writeFileSync(empty, '');
      process.env.GIT_CONFIG_GLOBAL = empty;
      await ownRepository();
      sinon.stub(SdkGeneratePrompts.prototype, 'repositoryFound');
    });

    afterEach(() => {
      if (globalConfig === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = globalConfig;
      }
    });

    const recordOne = () => execute({ 'README.md': '# sdk' });

    it('is installed after recording, and announced once, when its file is written', async () => {
      const file = new FilePath(sdk().join('.git', 'hooks'), new FileName('pre-push'));
      const shareHookInstalled = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookInstalled');
      const shareHookNeedsOneStep = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNeedsOneStep');
      const shareHookNotInstalled = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNotInstalled');

      expect((await recordOne()).isSuccess()).to.be.true;
      expect((await recordOne()).isSuccess()).to.be.true;

      expect(shareHookInstalled.calledOnce).to.be.true;
      expect(shareHookInstalled.firstCall.args[0].isEqual(file)).to.be.true;
      expect(fs.readFileSync(file.toString(), 'utf8')).to.contain('apimatic-pre-push');
      expect(shareHookNeedsOneStep.called).to.be.false;
      expect(shareHookNotInstalled.called).to.be.false;
    });

    it('shows the one step when git runs hooks from elsewhere, and still succeeds', async () => {
      await execa('git', ['config', 'core.hooksPath', '.husky/_'], { cwd: sdk().toString() });
      const shareHookNeedsOneStep = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNeedsOneStep');

      expect((await recordOne()).isSuccess()).to.be.true;

      const needed = shareHookNeedsOneStep.firstCall.args[0];
      expect(needed.kind).to.equal('elsewhere');
      expect(needed.file.isEqual(new FilePath(sdk().join('.husky'), new FileName('pre-push')))).to.be.true;
      expect(needed.steps).to.deep.equal(['addCall', 'commit']);
    });

    it('warns when the hook cannot be written, and still succeeds', async () => {
      sinon.stub(FileService.prototype, 'makeExecutable').rejects(new Error('EACCES: permission denied'));
      const shareHookNotInstalled = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNotInstalled');

      expect((await recordOne()).isSuccess()).to.be.true;

      expect(shareHookNotInstalled.firstCall.args[0]).to.deep.equal({ reason: 'EACCES: permission denied' });
    });
  });
});
