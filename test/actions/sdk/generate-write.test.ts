import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import { GenerateAction } from '../../../src/actions/sdk/generate.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import {
  CONFLICT_IN_PULL_REQUEST,
  MERGE_NEEDS_RESOLVING,
  SdkGeneratePrompts
} from '../../../src/prompts/sdk/generate.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { SdkContext } from '../../../src/types/sdk-context.js';
import { GENERATED_MARKER, YOURS_MARKER } from '../../../src/types/sdk/conflict-markers.js';
import { ConflictPolicy } from '../../../src/types/sdk/merge-plan.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, SdkGeneration } from '../../../src/types/sdk/generation-record.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';
import { SdkRepositoryContext } from '../../../src/types/sdk-repository-context.js';
import { terminal } from '../../../src/utils/terminal-utils.js';
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';
import { snapshotFiles } from '../../helpers/snapshots.js';

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
  let remote: string | undefined;
  let generates: (files: Files) => Promise<void>;
  const git = new GitService();

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));
  const sdkContext = () => new SdkContext(sdk());
  const at = (relative: string) => path.join(sdk().toString(), relative);
  const read = (relative: string) => fs.readFileSync(at(relative), 'utf-8');
  const record = () => GenerationRecord.parse(read('.apimatic/generation.json'))!;

  const execute = async (files: Files, force = true, onConflict?: ConflictPolicy) => {
    await generates(files);
    return new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(root)),
      undefined,
      Language.PYTHON,
      Stability.STABLE,
      force,
      undefined,
      undefined,
      onConflict
    );
  };

  /** A first generation of `files`, written and recorded into the project's repository. */
  const recorded = async (files: Files): Promise<{ repository: SdkRepositoryContext; base: CommitId }> => {
    writeFiles(sdk().toString(), files);
    await git.init(new DirectoryPath(root));
    const repository = (await sdkContext().repository())!;
    const tree = (await repository.snapshotGenerated(sdk()))._unsafeUnwrap();
    const written = (await repository.recordGeneration(tree, STABLE, '0.0.0'))._unsafeUnwrap();
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
    if (remote !== undefined) {
      fs.rmSync(remote, { recursive: true, force: true });
      remote = undefined;
    }
  });

  describe('overwrite', () => {
    it('replaces the directory with the generated files, keeping a .git and writing no record', async () => {
      sinon.stub(GitService.prototype, 'version').resolves(undefined);
      sinon.stub(SdkGeneratePrompts.prototype, 'gitUnavailable');
      writeFiles(sdk().toString(), { 'old.py': 'old', '.git/HEAD': 'ref: refs/heads/main' });
      const sdkGenerated = sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');

      expect((await execute({ 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(fs.readdirSync(sdk().toString()).sort()).to.deep.equal(['.git', 'README.md']);
      expect(sdkGenerated.firstCall.args[0].isEqual(sdk())).to.be.true;
    });
  });

  describe('record', () => {
    it('initialises a repository in the SDK directory, says so, and records the snapshot', async () => {
      const repositoryInitialised = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');

      const result = await execute({ 'README.md': '# sdk', 'a.py': 'x' });

      expect(result.isSuccess()).to.be.true;
      expect(repositoryInitialised.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(fs.readFileSync(at('.git/HEAD'), 'utf-8').trim()).to.equal('ref: refs/heads/main');
      const pristine = (await git.resolveRef(sdk(), SnapshotRef.pristine('')))!;
      expect(record().pristineCommit().isEqual(pristine)).to.be.true;
      expect(record().isFor(STABLE)).to.be.true;
      const repository = (await sdkContext().repository())!;
      const files = await snapshotFiles(repository.root(), pristine);
      expect([...files.keys()]).to.have.members(['README.md', 'a.py']);
    });

    it('records into the enclosing repository under the SDK directory’s ref, keeping what was there out of it', async () => {
      writeFiles(sdk().toString(), { 'old.py': 'old' });
      await git.init(new DirectoryPath(root));
      const repositoryInitialised = sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');

      expect((await execute({ 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(repositoryInitialised.called).to.be.false;
      expect(fs.existsSync(at('.git'))).to.be.false;
      expect(fs.existsSync(at('old.py'))).to.be.false;
      const ref = SnapshotRef.pristine('sdk/python');
      expect((await git.resolveRef(new DirectoryPath(root), ref))?.isEqual(record().pristineCommit())).to.be.true;
    });

    it('still succeeds, with a warning, when the snapshot cannot be recorded', async () => {
      sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
      sinon
        .stub(SdkRepositoryContext.prototype, 'recordGeneration')
        .resolves(err({ kind: 'gitFailed', reason: 'git broke' }));
      const snapshotNotRecorded = sinon.stub(SdkGeneratePrompts.prototype, 'snapshotNotRecorded');

      expect((await execute({ 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(read('README.md')).to.equal('# sdk');
      expect(snapshotNotRecorded.firstCall.args[0]).to.equal('git broke');
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
      expect((await git.describe(repository.root(), record().pristineCommit())).parents).to.deep.equal([base]);
      const previous = (await git.resolveRef(repository.root(), repository.previousRef()))!;
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
      expect(result.getMessage()).to.equal('Resolve the conflicts and rerun');
      expect(conflicts.firstCall.args[0].conflicts).to.deep.equal([
        { path: rel('models/book.py'), kind: 'bothChanged' }
      ]);
      expect(read('models/book.py')).to.contain(`${YOURS_MARKER}\n    # Price in USD, VAT included.\n=======\n`);
      expect(read('models/book.py')).to.contain('    # Retail price in US dollars.\n');
      expect(read('models/book.py')).to.contain(`${GENERATED_MARKER}\n`);
      expect(read('README.md')).to.equal('# sdk v2');
      expect(record().toJson()).to.not.contain('conflicts');
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
        .resolves(err({ kind: 'gitFailed', reason: 'index locked' }));
      sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
      const conflictsNotStaged = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsNotStaged');
      const conflicts = sinon.stub(SdkGeneratePrompts.prototype, 'conflicts');

      const result = await execute({ 'models/book.py': MODEL_V2 });

      expect(result.isFailed()).to.be.true;
      expect(result.getMessage()).to.equal('Resolve the conflicts and rerun');
      expect(conflictsNotStaged.firstCall.args[0]).to.equal('index locked');
      expect(conflicts.called).to.be.true;
      expect(read('models/book.py')).to.contain(YOURS_MARKER);
    });

    it('leaves the directory alone when the pre-run state cannot be kept', async () => {
      const { base } = await recorded({ 'README.md': '# sdk' });
      writeFiles(sdk().toString(), { 'README.md': '# edited' });
      sinon
        .stub(SdkRepositoryContext.prototype, 'savePrevious')
        .resolves(err({ kind: 'gitFailed', reason: 'git broke' }));
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
      const previous = (await git.resolveRef(repository.root(), repository.previousRef()))!;
      expect((await snapshotFiles(repository.root(), previous)).get('models/book.py')).to.equal(
        DECORATED + MODEL_V1_EDITED
      );
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

    it('writes nothing at all when the developer cancels the run, or backs out of the question', async () => {
      for (const answer of ['cancel', undefined] as const) {
        const { repository, base } = await conflicting();
        sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves(answer);
        const runCancelled = sinon.stub(SdkGeneratePrompts.prototype, 'runCancelled');

        const result = await execute(NEXT, false);

        expect(result.isCancelled(), String(answer)).to.be.true;
        expect(read('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
        expect(read('README.md')).to.equal('# sdk');
        expect(record().pristineCommit().isEqual(base)).to.be.true;
        expect(await git.resolveRef(repository.root(), repository.previousRef())).to.be.undefined;
        expect(runCancelled.calledOnce).to.be.true;
        sinon.restore();
        fs.rmSync(root, { recursive: true, force: true });
        fresh();
      }
    });

    /** The project committed on main, SDK edits included, with a bare origin to push to. */
    const committed = async () => {
      const { repository, base } = await conflicting();
      writeFiles(root, { 'project.txt': 'not the sdk' });
      await execa('git', ['add', '-A'], { cwd: root });
      await execa('git', [...asDeveloper, 'commit', '-q', '-m', 'edits'], { cwd: root });
      remote = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-remote-'));
      await execa('git', ['init', '--bare', '--quiet', origin()]);
      await execa('git', ['remote', 'add', 'origin', origin()], { cwd: root });
      const head = (await git.headCommit(repository.root()))!;
      return { repository, base, head };
    };

    const origin = () => path.join(remote!, 'origin.git');

    const asDeveloper = ['-c', 'user.name=dev', '-c', 'user.email=dev@example.com'];

    /** Merges the generated branch into the yours branch on the remote, resolving the one conflict by hand. */
    const mergePullRequest = async (yours: string, generated: string) => {
      const work = path.join(remote!, 'work');
      await execa('git', ['clone', '-q', origin(), work]);
      await execa('git', ['switch', '-q', yours], { cwd: work });
      await execa('git', [...asDeveloper, 'merge', '-q', '--no-edit', `origin/${generated}`], {
        cwd: work,
        reject: false
      });
      writeFiles(work, { 'sdk/python/models/book.py': DECORATED + MODEL_V2 });
      await execa('git', ['add', '-A'], { cwd: work });
      await execa('git', [...asDeveloper, 'commit', '-q', '-m', 'merged'], { cwd: work });
      await execa('git', ['push', '-q', 'origin', yours], { cwd: work });
    };

    const branchCommit = async (branch: string) =>
      CommitId.fromGit((await execa('git', ['rev-parse', `refs/heads/${branch}`], { cwd: root })).stdout.trim());

    const refsIn = async (cwd: string, prefix: string) =>
      (await execa('git', ['for-each-ref', '--format=%(refname:short)', prefix], { cwd })).stdout
        .split('\n')
        .filter((line) => line !== '')
        .sort();

    const publish = async () => {
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('pullRequest');
      const conflictsPublished = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsPublished');
      const result = await execute(NEXT, false);
      return { result, published: conflictsPublished.firstCall.args[1] };
    };

    it('publishes the base, your files and the generator’s output as a pull request on your commit, and remembers it', async () => {
      const { repository, base, head } = await committed();

      const { result, published } = await publish();

      expect(result.isFailed()).to.be.true;
      expect(result.getMessage()).to.equal(CONFLICT_IN_PULL_REQUEST);
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
      expect(read('README.md')).to.equal('# sdk');
      expect(record().pristineCommit().isEqual(base)).to.be.true;
      expect(await git.resolveRef(repository.root(), repository.previousRef())).to.be.undefined;
      expect(published.remote).to.equal('origin');
      expect(published.link).to.be.undefined;
      const { yours, generated } = published.branches;
      expect(record().pendingPullRequest()).to.deep.equal({ yours, generated, remote: 'origin' });
      expect(await refsIn(origin(), 'refs/heads/apimatic/')).to.deep.equal([generated, yours].sort());

      const yoursCommit = await branchCommit(yours);
      const generatedCommit = await branchCommit(generated);
      const [baseCommit] = (await git.describe(repository.root(), yoursCommit)).parents;
      expect((await git.describe(repository.root(), generatedCommit)).parents).to.deep.equal([baseCommit]);
      expect((await git.describe(repository.root(), baseCommit)).parents).to.deep.equal([head]);
      const mergeBase = (
        await execa('git', ['merge-base', yoursCommit.toString(), generatedCommit.toString()], { cwd: root })
      ).stdout.trim();
      expect(mergeBase).to.equal(baseCommit.toString());

      const baseFiles = await snapshotFiles(repository.root(), baseCommit);
      const yoursFiles = await snapshotFiles(repository.root(), yoursCommit);
      const generatedFiles = await snapshotFiles(repository.root(), generatedCommit);
      for (const files of [baseFiles, yoursFiles, generatedFiles]) {
        expect(files.get('project.txt')).to.equal('not the sdk');
      }
      expect(baseFiles.get('sdk/python/models/book.py')).to.equal(MODEL_V1);
      expect(baseFiles.get('sdk/python/.apimatic/generation.json')).to.equal(record().forgetting().toJson());
      expect(yoursFiles.get('sdk/python/models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
      expect(yoursFiles.get('sdk/python/notes.txt')).to.equal('mine');
      expect(generatedFiles.get('sdk/python/models/book.py')).to.equal(MODEL_V2);
      expect(generatedFiles.get('sdk/python/README.md')).to.equal('# sdk v2');
      expect(generatedFiles.has('sdk/python/notes.txt')).to.be.false;

      const pristine = (await git.resolveRef(repository.root(), repository.pristineRef()))!;
      expect(pristine.isEqual(base)).to.be.false;
      expect((await git.describe(repository.root(), pristine)).parents).to.deep.equal([base]);
      const nextRecord = GenerationRecord.parse(generatedFiles.get('sdk/python/.apimatic/generation.json')!)!;
      expect(nextRecord.pristineCommit().isEqual(pristine)).to.be.true;
      expect(await refsIn(origin(), 'refs/apimatic/')).to.deep.equal(['apimatic/pristine/sdk/python']);

      const merge = await git.mergeTree(repository.root(), yoursCommit, generatedCommit);
      expect([...new Set(merge.stages.map((entry) => entry.path.toString()))]).to.deep.equal([
        'sdk/python/models/book.py'
      ]);
    });

    it('takes the merged pull request into the directory on the next run, and continues from its base', async () => {
      const { repository } = await committed();
      const { published } = await publish();
      const { yours, generated } = published.branches;
      await mergePullRequest(yours, generated);
      const pristine = (await git.resolveRef(repository.root(), repository.pristineRef()))!;
      const conflictChoice = SdkGeneratePrompts.prototype.conflictChoice as sinon.SinonStub;
      conflictChoice.resetHistory();
      const pullRequestTaken = sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestTaken');

      const result = await execute(NEXT, false);

      expect(result.isSuccess()).to.be.true;
      expect(pullRequestTaken.calledOnce).to.be.true;
      expect(pullRequestTaken.firstCall.args[1]).to.deep.equal({ yours, generated, remote: 'origin' });
      expect(conflictChoice.called).to.be.false;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
      expect(read('README.md')).to.equal('# sdk v2');
      expect(read('notes.txt')).to.equal('mine');
      expect(record().pristineCommit().isEqual(pristine)).to.be.true;
      expect(record().pendingPullRequest()).to.be.undefined;
      expect((await git.resolveRef(repository.root(), repository.pristineRef()))!.isEqual(pristine)).to.be.true;
      const previous = (await git.resolveRef(repository.root(), repository.previousRef()))!;
      expect((await snapshotFiles(repository.root(), previous)).get('models/book.py')).to.equal(DECORATED + MODEL_V2);
    });

    it('waits while the pull request is open, on request or when it cannot ask, and changes nothing', async () => {
      await committed();
      const { published } = await publish();
      const { yours, generated } = published.branches;
      const pullRequestPending = sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestPending');
      const pullRequestChoice = sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestChoice').resolves('wait');
      const pullRequestWaiting = sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestWaiting');

      const asked = await execute(NEXT, false);
      (terminal.isInteractive as sinon.SinonStub).returns(false);
      const unasked = await execute(NEXT, false);

      expect(asked.isFailed()).to.be.true;
      expect(unasked.isFailed()).to.be.true;
      expect(pullRequestPending.firstCall.args).to.deep.equal([
        { yours, generated, remote: 'origin' },
        'open',
        undefined
      ]);
      expect(pullRequestChoice.calledOnce).to.be.true;
      expect(pullRequestWaiting.calledTwice).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
      expect(record().pendingPullRequest()).to.deep.equal({ yours, generated, remote: 'origin' });
    });

    it('forgets the pull request on request, and regenerates over the files as they are', async () => {
      await committed();
      await publish();
      sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestPending');
      sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestChoice').resolves('forget');
      const pullRequestForgotten = sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestForgotten');
      (SdkGeneratePrompts.prototype.conflictChoice as sinon.SinonStub).resolves('generated');
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      const result = await execute(NEXT, false);

      expect(result.isSuccess()).to.be.true;
      expect(pullRequestForgotten.calledOnce).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
      expect(record().pendingPullRequest()).to.be.undefined;
    });

    it('forgets the pull request with --force, without asking', async () => {
      await committed();
      await publish();
      sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestPending');
      const pullRequestChoice = sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestChoice');
      sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestForgotten');
      sinon.stub(SdkGeneratePrompts.prototype, 'conflicts');

      const result = await execute(NEXT, true);

      expect(result.isFailed()).to.be.true;
      expect(result.getMessage()).to.equal(MERGE_NEEDS_RESOLVING);
      expect(pullRequestChoice.called).to.be.false;
      expect(read('models/book.py')).to.contain(YOURS_MARKER);
      expect(record().pendingPullRequest()).to.be.undefined;
    });

    it('says when the branch is gone, and offers only to forget it', async () => {
      await committed();
      const { published } = await publish();
      const { yours, generated } = published.branches;
      await execa('git', ['branch', '-D', yours], { cwd: origin() });
      const pullRequestPending = sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestPending');
      const pullRequestChoice = sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestChoice').resolves(undefined);

      const result = await execute(NEXT, false);

      expect(result.isCancelled()).to.be.true;
      expect(pullRequestPending.firstCall.args).to.deep.equal([
        { yours, generated, remote: 'origin' },
        'gone',
        undefined
      ]);
      expect(pullRequestChoice.firstCall.args).to.deep.equal(['gone']);
      expect(record().pendingPullRequest()).to.deep.equal({ yours, generated, remote: 'origin' });
    });

    it('still creates the branches, from nothing when there is no commit, and says there is no remote', async () => {
      const { repository, base } = await conflicting();

      const { result, published } = await publish();

      expect(result.isFailed()).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
      expect(published.remote).to.be.undefined;
      expect(published.link).to.be.undefined;
      const { yours, generated } = published.branches;
      expect(await refsIn(root, 'refs/heads/apimatic/')).to.deep.equal([generated, yours].sort());
      const yoursCommit = await branchCommit(yours);
      const [baseCommit] = (await git.describe(repository.root(), yoursCommit)).parents;
      expect((await git.describe(repository.root(), baseCommit)).parents).to.deep.equal([]);
      const baseFiles = await snapshotFiles(repository.root(), baseCommit);
      expect([...baseFiles.keys()].sort()).to.deep.equal([
        'sdk/python/.apimatic/.gitattributes',
        'sdk/python/.apimatic/generation.json',
        'sdk/python/README.md',
        'sdk/python/models/book.py'
      ]);
      expect(baseFiles.get('sdk/python/models/book.py')).to.equal(MODEL_V1);
      expect((await snapshotFiles(repository.root(), yoursCommit)).get('sdk/python/models/book.py')).to.equal(
        DECORATED + MODEL_V1_EDITED
      );
      expect(record().pristineCommit().isEqual(base)).to.be.true;
      expect(record().pendingPullRequest()).to.deep.equal({ yours, generated, remote: undefined });
      expect((await git.resolveRef(repository.root(), repository.pristineRef()))!.isEqual(base)).to.be.false;

      const pullRequestPending = sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestPending');
      sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestChoice').resolves('wait');
      sinon.stub(SdkGeneratePrompts.prototype, 'pullRequestWaiting');

      expect((await execute(NEXT, false)).isFailed()).to.be.true;
      expect(pullRequestPending.firstCall.args).to.deep.equal([
        { yours, generated, remote: undefined },
        'open',
        undefined
      ]);
    });

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

    it('takes --on-conflict over the question, so a run that cannot ask still publishes or settles', async () => {
      const { repository } = await conflicting();
      (terminal.isInteractive as sinon.SinonStub).returns(false);
      const conflictChoice = sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice');
      const conflictsPublished = sinon.stub(SdkGeneratePrompts.prototype, 'conflictsPublished');

      const result = await execute(NEXT, true, 'pullRequest');

      expect(result.isFailed()).to.be.true;
      expect(result.getMessage()).to.equal(CONFLICT_IN_PULL_REQUEST);
      expect(conflictChoice.called).to.be.false;
      expect(conflictsPublished.calledOnce).to.be.true;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V1_EDITED);
      const { stdout } = await execa('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/apimatic/'], {
        cwd: repository.root().toString()
      });
      expect(stdout.split('\n')).to.have.length(2);
    });

    it('settles for a side given as --on-conflict without asking', async () => {
      await conflicting();
      (terminal.isInteractive as sinon.SinonStub).returns(false);
      const conflictChoice = sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice');
      sinon.stub(SdkGeneratePrompts.prototype, 'conflictsResolved');

      const result = await execute(NEXT, true, 'generated');

      expect(result.isSuccess()).to.be.true;
      expect(conflictChoice.called).to.be.false;
      expect(read('models/book.py')).to.equal(DECORATED + MODEL_V2);
    });

    it('does not ask without a terminal, or with --force: markers, the list and the steps', async () => {
      await conflicting();
      (terminal.isInteractive as sinon.SinonStub).returns(false);
      const conflictChoice = sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice');
      const conflicts = sinon.stub(SdkGeneratePrompts.prototype, 'conflicts');

      const result = await execute(NEXT, false);

      expect(result.isFailed()).to.be.true;
      expect(conflictChoice.called).to.be.false;
      expect(conflicts.calledOnce).to.be.true;
      expect(read('models/book.py')).to.contain(YOURS_MARKER);
    });
  });

  describe('the hook that shares snapshots', () => {
    beforeEach(() => {
      sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
    });

    const recordOne = () => execute({ 'README.md': '# sdk' });

    it('is installed after recording, without a word', async () => {
      const file = new FilePath(new DirectoryPath(root), new FileName('pre-push'));
      const install = sinon
        .stub(SdkRepositoryContext.prototype, 'installShareHook')
        .resolves(ok({ kind: 'installed', file }));
      const shareHookNeedsOneStep = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNeedsOneStep');
      const shareHookNotInstalled = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNotInstalled');

      expect((await recordOne()).isSuccess()).to.be.true;

      expect(install.calledOnce).to.be.true;
      expect(shareHookNeedsOneStep.called).to.be.false;
      expect(shareHookNotInstalled.called).to.be.false;
    });

    it('shows the one step when git runs hooks from elsewhere, and still succeeds', async () => {
      const file = new FilePath(new DirectoryPath(root), new FileName('pre-push'));
      const script = new FilePath(new DirectoryPath(root), new FileName('apimatic-pre-push'));
      const needed = { kind: 'elsewhere' as const, file, hooksPath: '.husky/_', script };
      sinon.stub(SdkRepositoryContext.prototype, 'installShareHook').resolves(ok(needed));
      const shareHookNeedsOneStep = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNeedsOneStep');

      expect((await recordOne()).isSuccess()).to.be.true;

      expect(shareHookNeedsOneStep.firstCall.args[0]).to.equal(needed);
    });

    it('warns when the hook cannot be written, and still succeeds', async () => {
      sinon
        .stub(SdkRepositoryContext.prototype, 'installShareHook')
        .resolves(err({ kind: 'hookNotWritten', reason: 'EACCES: permission denied' }));
      const shareHookNotInstalled = sinon.stub(SdkGeneratePrompts.prototype, 'shareHookNotInstalled');

      expect((await recordOne()).isSuccess()).to.be.true;

      expect(shareHookNotInstalled.firstCall.args[0]).to.equal('EACCES: permission denied');
    });
  });
});
