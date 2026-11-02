import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
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
import { Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, recordContents } from '../../../src/types/sdk/generation-record.js';
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';
import { describeCommit } from '../../helpers/snapshots.js';

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
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('merges the generator’s changes into your edited files, adds new files and keeps your own, without asking', async () => {
    const first = await recorded();
    write({ 'models/book.py': DECORATED + MODEL_V1, 'notes.txt': 'mine' });
    const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk');

    expect((await execute(V2)).isSuccess()).to.be.true;

    expect(overwriteSdk.called).to.be.false;
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

  it('refuses conflicts, naming them, and writes nothing', async () => {
    const first = await recorded();
    write({ 'models/book.py': MODEL_V1_EDITED });
    const conflictsNotAsked = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsNotAsked');

    expect((await execute(V2)).isFailed()).to.be.true;

    const [directory, conflicts] = conflictsNotAsked.firstCall.args;
    expect(conflicts.map((conflict) => [conflict.path.toString(), conflict.kind])).to.deep.equal([
      ['models/book.py', 'bothChanged']
    ]);
    expect(directory.isEqual(sdk())).to.be.true;
    expect(read('models/book.py')).to.equal(MODEL_V1_EDITED);
    expect(read('README.md')).to.equal('# sdk');
    expect(fs.existsSync(at('models/author.py'))).to.be.false;
    expect(base()).to.deep.equal(first);
    expect(sdkMerged().called).to.be.false;
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

    const [directory, previous, reason] = sdkNotRestored.firstCall.args;
    expect(directory.isEqual(sdk())).to.be.true;
    expect(previous).to.deep.equal((await git.resolveRef(sdk(), PREVIOUS_REF))._unsafeUnwrap());
    expect(reason).to.equal('EBUSY: resource busy');
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
});
