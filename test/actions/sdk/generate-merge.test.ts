import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { err } from 'neverthrow';
import sinon from 'sinon';
import { GenerateAction } from '../../../src/actions/sdk/generate.js';
import { FileService } from '../../../src/infrastructure/file-service.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { canonical } from '../../../src/infrastructure/tmp-extensions.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { GitContext } from '../../../src/types/git-context.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { GENERATED_MARKER, YOURS_MARKER } from '../../../src/types/sdk/conflict-markers.js';
import { Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, recordContents } from '../../../src/types/sdk/generation-record.js';
import { kinds } from '../../helpers/merge.js';
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';
import { describeCommit, snapshotFiles } from '../../helpers/snapshots.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };
/** Where the SDK directory's own repository keeps each generation as the server returned it. */
const PRISTINE_REF = 'refs/apimatic/pristine';
/** The ref a merge keeps the directory under before writing, byte for byte. */
const PREVIOUS_REF = 'refs/apimatic/previous';
const RECORD = '.apimatic/generation.json';

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
/** The edited model merged with v2 as git leaves it: the comment in conflict, the new field below. */
const MODEL_MARKED =
  MODEL_V1.replace(
    '    # Price in USD.\n',
    `${YOURS_MARKER}\n    # Price in USD, VAT included.\n=======\n    # Retail price in US dollars.\n${GENERATED_MARKER}\n`
  ) + '    isbn: str\n';

const V1: Files = { 'README.md': '# sdk', 'models/book.py': MODEL_V1 };
const V2: Files = { 'README.md': '# sdk v2', 'models/book.py': MODEL_V2, 'models/author.py': 'class Author: ...' };

/** A run into a repository holding a record for this generation merges the fresh output over the directory as it is. */
describe('GenerateAction (sdk) — a regeneration merges', () => {
  let root: string;
  let generates: (files: Files) => Promise<void>;
  let generateSdk: sinon.SinonStub;
  const git = new GitService();

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));
  const at = (relative: string) => path.join(sdk().toString(), relative);
  const read = (relative: string) => fs.readFileSync(at(relative), 'utf8');
  const write = (files: Files) => writeFiles(sdk().toString(), files);
  const pristine = async () => (await git.resolveRef(sdk(), PRISTINE_REF))._unsafeUnwrap();
  const record = () => GenerationRecord.parse(read(RECORD));
  const base = () => record().baseFor(Language.PYTHON, Stability.STABLE);
  const sdkMerged = () => SdkGeneratePrompts.prototype.sdkMerged as sinon.SinonStub;
  const listed = (paths: readonly { toString(): string }[]) => paths.map(String);

  const execute = async (
    files: Files,
    options: { force?: boolean; canAsk?: boolean; gitInit?: boolean; stability?: Stability } = {}
  ) => {
    await generates(files);
    return new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(root)),
      sdk(),
      Language.PYTHON,
      options.stability ?? Stability.STABLE,
      options.force ?? false,
      options.canAsk ?? true,
      options.gitInit ?? false
    );
  };

  /** A first generation written and recorded into the SDK directory's own repository, as a run with --git-init leaves it. */
  const recorded = async (files: Files = V1): Promise<CommitId> => {
    expect((await execute(files, { gitInit: true })).isSuccess()).to.be.true;
    return (await pristine())!;
  };

  beforeEach(() => {
    root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-merge-')));
    ({ generates, generateSdk } = stubSdkGeneration(root));
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryFound');
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
    sinon.stub(SdkGeneratePrompts.prototype, 'shareHook');
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('merges the generator’s changes into your edited files, adds new files and keeps your own, without asking', async () => {
    const first = await recorded();
    write({ 'models/book.py': DECORATED + MODEL_V1, 'notes.txt': 'mine' });
    const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk');
    const conflictChoice = sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice');
    const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

    expect((await execute(V2)).isSuccess()).to.be.true;

    expect(overwriteSdk.called).to.be.false;
    expect(conflictChoice.called).to.be.false;
    expect(conflictsResolved.called).to.be.false;
    expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
    expect(read('README.md')).to.equal('# sdk v2');
    expect(read('models/author.py')).to.equal('class Author: ...');
    expect(read('notes.txt')).to.equal('mine');
    const files = sdkMerged().firstCall.args[1];
    expect(listed(files.added)).to.deep.equal(['models/author.py']);
    expect(listed(files.updated)).to.deep.equal(['README.md']);
    expect(listed(files.merged)).to.deep.equal(['models/book.py']);
    expect(listed(files.removed)).to.deep.equal([]);
    expect(listed(files.kept)).to.deep.equal(['notes.txt']);
    expect(base()).to.deep.equal(await pristine());
    expect((await describeCommit(sdk(), base()!)).parents).to.deep.equal([first]);
  });

  it('refuses without a terminal, naming the conflicts, and writes nothing', async () => {
    const first = await recorded();
    write({ 'models/book.py': MODEL_V1_EDITED });
    const conflictChoice = sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice');
    const conflictsNotAsked = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsNotAsked');

    expect((await execute(V2, { canAsk: false })).isFailed()).to.be.true;

    const [directory, conflicts] = conflictsNotAsked.firstCall.args;
    expect(kinds(conflicts)).to.deep.equal([['models/book.py', 'bothChanged']]);
    expect(directory.isEqual(sdk())).to.be.true;
    expect(conflictChoice.called).to.be.false;
    expect(read('models/book.py')).to.equal(MODEL_V1_EDITED);
    expect(read('README.md')).to.equal('# sdk');
    expect(fs.existsSync(at('models/author.py'))).to.be.false;
    expect(base()).to.deep.equal(first);
    expect(sdkMerged().called).to.be.false;
  });

  it('writes markers where you and the generator changed the same lines when you will resolve them, for a merge tool to find', async () => {
    const first = await recorded();
    write({ 'models/book.py': MODEL_V1_EDITED });
    sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('asPlaced');
    const conflictSteps = sinon.stub(SdkGeneratePrompts.prototype, 'conflictSteps');

    const result = await execute(V2);

    expect(result.isActionRequired()).to.be.true;
    const [directory, marked, unmarked] = conflictSteps.firstCall.args;
    expect(directory.isEqual(sdk())).to.be.true;
    expect(listed(marked)).to.deep.equal(['models/book.py']);
    expect(unmarked).to.deep.equal([]);
    expect(sdkMerged().firstCall.args[2]).to.equal(1);
    expect(sdkMerged().calledBefore(conflictSteps)).to.be.true;
    expect(read('models/book.py')).to.equal(MODEL_MARKED);
    expect(read('README.md')).to.equal('# sdk v2');
    expect(read('models/author.py')).to.equal('class Author: ...');
    expect(base()).to.deep.equal(await pristine());
    expect((await describeCommit(sdk(), base()!)).parents).to.deep.equal([first]);
    const previous = (await git.resolveRef(sdk(), PREVIOUS_REF))._unsafeUnwrap()!;
    expect((await snapshotFiles(sdk(), previous)).get('models/book.py')).to.equal(MODEL_V1_EDITED);
    const cwd = sdk().toString();
    expect((await execa('git', ['status', '--porcelain'], { cwd })).stdout).to.contain('UU models/book.py');
    const stages = (await execa('git', ['ls-files', '--stage', '--', 'models/book.py'], { cwd })).stdout;
    expect(stages.split('\n').map((line) => line.split(/\s+/)[2])).to.deep.equal(['1', '2', '3']);
  });

  it('leaves the merge tool out of the steps when the conflicts cannot be marked in the index, with a warning', async () => {
    await recorded();
    write({ 'models/book.py': MODEL_V1_EDITED });
    sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('asPlaced');
    sinon.stub(GitService.prototype, 'stageConflicts').resolves(err('index locked'));
    const conflictsNotStaged = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsNotStaged');
    const conflictSteps = sinon.stub(SdkGeneratePrompts.prototype, 'conflictSteps');
    const conflictStepsByHand = sinon.stub(SdkGeneratePrompts.prototype, 'conflictStepsByHand');

    const result = await execute(V2);

    expect(result.isActionRequired()).to.be.true;
    expect(conflictsNotStaged.firstCall.args).to.deep.equal(['index locked']);
    expect(conflictSteps.called).to.be.false;
    expect(listed(conflictStepsByHand.firstCall.args[1])).to.deep.equal(['models/book.py']);
    expect(conflictsNotStaged.calledBefore(conflictStepsByHand)).to.be.true;
    expect(read('models/book.py')).to.contain(YOURS_MARKER);
  });

  for (const [what, prepare] of [
    ['another stability', async () => ({ stability: Stability.BETA })],
    [
      'a snapshot the repository does not hold',
      async () => {
        write({
          [RECORD]: recordContents(Language.PYTHON, Stability.STABLE, CommitId.fromGit('f'.repeat(40))!)
        });
        return {};
      }
    ]
  ] as const) {
    it(`replaces, with --force, an SDK recorded for ${what}, warning, and records it for the next run`, async () => {
      await recorded();
      write({ 'README.md': '# edited' });
      sinon.stub(SdkGeneratePrompts.prototype, 'snapshotMissing');
      const replaced = sinon.stub(SdkGeneratePrompts.prototype, 'recordedSdkReplaced');
      const options: { stability?: Stability } = await prepare();

      expect((await execute(V2, { ...options, force: true })).isSuccess()).to.be.true;

      expect(replaced.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(read('README.md')).to.equal('# sdk v2');
      expect(record().baseFor(Language.PYTHON, options.stability ?? Stability.STABLE)).to.deep.equal(await pristine());
      expect(sdkMerged().called).to.be.false;
    });
  }

  it('asks before replacing a recorded SDK it cannot merge into, and does not warn when the developer agrees', async () => {
    await recorded();
    const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(true);
    const replaced = sinon.stub(SdkGeneratePrompts.prototype, 'recordedSdkReplaced');

    expect((await execute(V2, { stability: Stability.BETA })).isSuccess()).to.be.true;

    expect(overwriteSdk.calledOnce).to.be.true;
    expect(replaced.called).to.be.false;
    expect(read('README.md')).to.equal('# sdk v2');
  });

  it('fails with its own message, writing nothing, when git cannot work out the merge', async () => {
    await recorded();
    write({ 'notes.txt': 'mine' });
    sinon.stub(GitService.prototype, 'mergeTree').resolves(err('git broke'));
    const customCodeFailed = sinon.stub(SdkGeneratePrompts.prototype, 'customCodeFailed');

    expect((await execute(V2)).isFailed()).to.be.true;

    expect(customCodeFailed.firstCall.args).to.deep.equal(['git broke']);
    expect(read('README.md')).to.equal('# sdk');
    expect(fs.existsSync(at('models/author.py'))).to.be.false;
  });

  it('fails with its own message, writing nothing, when the directory cannot be kept before the write', async () => {
    const first = await recorded();
    write({ 'notes.txt': 'mine' });
    const real = GitService.prototype.updateRef;
    sinon.stub(GitService.prototype, 'updateRef').callsFake(function (this: GitService, root, ref, commit) {
      return ref === PREVIOUS_REF ? Promise.resolve(err('git broke')) : real.call(this, root, ref, commit);
    });
    const customCodeFailed = sinon.stub(SdkGeneratePrompts.prototype, 'customCodeFailed');

    expect((await execute(V2)).isFailed()).to.be.true;

    expect(customCodeFailed.firstCall.args).to.deep.equal(['git broke']);
    expect(read('README.md')).to.equal('# sdk');
    expect(read('notes.txt')).to.equal('mine');
    expect(fs.existsSync(at('models/author.py'))).to.be.false;
    expect(base()).to.deep.equal(first);
  });

  it('puts the directory back and names the file when a write fails partway', async () => {
    const first = await recorded();
    const real = FileService.prototype.writeBytes;
    sinon.stub(FileService.prototype, 'writeBytes').callsFake(function (this: FileService, file, content) {
      return file.toString().endsWith('book.py')
        ? Promise.reject(new Error('EACCES: permission denied'))
        : real.call(this, file, content);
    });
    const sdkNotWritten = sinon.stub(SdkGeneratePrompts.prototype, 'sdkNotWritten');
    const sdkRestored = sinon.stub(SdkGeneratePrompts.prototype, 'sdkRestored');

    expect((await execute(V2)).isFailed()).to.be.true;

    const [directory, problem] = sdkNotWritten.firstCall.args;
    expect(directory.isEqual(sdk())).to.be.true;
    expect(problem.file.toString()).to.equal('models/book.py');
    expect(problem.operation).to.equal('write');
    expect(problem.reason).to.contain('EACCES');
    expect(sdkRestored.firstCall.args[0].isEqual(sdk())).to.be.true;
    expect(read('README.md')).to.equal('# sdk');
    expect(read('models/book.py')).to.equal(MODEL_V1);
    expect(fs.existsSync(at('models/author.py'))).to.be.false;
    expect(base()).to.deep.equal(first);
    expect(generateSdk.calledTwice).to.be.true;
  });

  it('gives the restore command when the directory cannot be put back either', async () => {
    await recorded();
    sinon.stub(FileService.prototype, 'writeBytes').rejects(new Error('EACCES: permission denied'));
    sinon.stub(GitContext.prototype, 'restore').resolves(err('EBUSY: resource busy'));
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkNotWritten');
    const sdkNotRestored = sinon.stub(SdkGeneratePrompts.prototype, 'sdkNotRestored');

    expect((await execute(V2)).isFailed()).to.be.true;

    const [directory, reason] = sdkNotRestored.firstCall.args;
    expect(directory.isEqual(sdk())).to.be.true;
    expect(reason).to.equal('EBUSY: resource busy');
    // The command the developer is given names the ref, which still holds the directory as it was.
    expect((await git.resolveRef(sdk(), PREVIOUS_REF))._unsafeUnwrap()).to.not.be.undefined;
  });

  it('warns, keeping the old record, when the new snapshot cannot be recorded after a merge', async () => {
    const first = await recorded();
    const real = GitService.prototype.updateRef;
    sinon.stub(GitService.prototype, 'updateRef').callsFake(function (this: GitService, root, ref, commit) {
      return ref === PRISTINE_REF ? Promise.resolve(err('git broke')) : real.call(this, root, ref, commit);
    });
    const notRecorded = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotNotRecordedAfterMerge');

    expect((await execute(V2)).isSuccess()).to.be.true;

    expect(notRecorded.firstCall.args).to.deep.equal(['git broke']);
    expect(read('README.md')).to.equal('# sdk v2');
    expect(base()).to.deep.equal(first);
    expect(sdkMerged().calledOnce).to.be.true;
  });

  describe('the question when the merge conflicts', () => {
    const NEXT: Files = { 'README.md': '# sdk v2', 'models/book.py': MODEL_V2 };

    /** The two conflicts `conflicting` sets up, as the prompts are told of them. */
    const CONFLICTS = [
      ['models/book.py', 'bothChanged'],
      ['helpers/old.py', 'noLongerGenerated']
    ];

    /** An edited model the generator also changed, an edited helper it stopped producing, and a clean change elsewhere. */
    const conflicting = async () => {
      const first = await recorded({ ...V1, 'helpers/old.py': 'old' });
      write({ 'models/book.py': DECORATED + MODEL_V1_EDITED, 'helpers/old.py': 'old, edited', 'notes.txt': 'mine' });
      return first;
    };

    it('settles the overlapping hunks for the generator on request, keeping your other edits and a file it stopped producing', async () => {
      await conflicting();
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('generated');
      const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      const result = await execute(NEXT);

      expect(result.isSuccess()).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
      expect(read('helpers/old.py')).to.equal('old, edited');
      expect(read('README.md')).to.equal('# sdk v2');
      expect(read('notes.txt')).to.equal('mine');
      const [directory, side, paths] = conflictsResolved.firstCall.args;
      expect(directory.isEqual(sdk())).to.be.true;
      expect(side).to.equal('generated');
      expect(listed(paths)).to.have.members(CONFLICTS.map(([path]) => path));
      expect(conflictsResolved.calledBefore(sdkMerged())).to.be.true;
      const files = sdkMerged().firstCall.args[1];
      expect(listed(files.merged)).to.deep.equal(['models/book.py']);
      expect(listed(files.kept)).to.have.members(['helpers/old.py', 'notes.txt']);
      const previous = (await git.resolveRef(sdk(), PREVIOUS_REF))._unsafeUnwrap()!;
      expect((await snapshotFiles(sdk(), previous)).get('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
    });

    it('writes nothing at all when the developer cancels at the question', async () => {
      const first = await conflicting();
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('cancel');
      const runCancelled = sinon.stub(SdkGeneratePrompts.prototype, 'runCancelled');

      const result = await execute(NEXT);

      expect(result.isCancelled()).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
      expect(read('README.md')).to.equal('# sdk');
      expect(base()).to.deep.equal(first);
      expect((await git.resolveRef(sdk(), PREVIOUS_REF))._unsafeUnwrap()).to.be.undefined;
      expect(runCancelled.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(sdkMerged().called).to.be.false;
    });

    for (const [where, canAsk] of [
      ['in a terminal', true],
      ['without one', false]
    ] as const) {
      it(`does not ask with --force ${where}, and settles the overlapping hunks for the generator`, async () => {
        await conflicting();
        const conflictChoice = sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice');
        const conflictsNotAsked = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsNotAsked');
        const conflictsResolved = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

        const result = await execute(NEXT, { force: true, canAsk });

        expect(result.isSuccess()).to.be.true;
        expect(conflictChoice.called).to.be.false;
        expect(conflictsNotAsked.called).to.be.false;
        expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
        expect(read('helpers/old.py')).to.equal('old, edited');
        expect(read('notes.txt')).to.equal('mine');
        expect(conflictsResolved.firstCall.args[1]).to.equal('generated');
        expect(listed(conflictsResolved.firstCall.args[2])).to.have.members(CONFLICTS.map(([path]) => path));
      });
    }
  });
});
