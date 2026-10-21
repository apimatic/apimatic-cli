import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { execa } from 'execa';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import { SdkWriteAction } from '../../../src/actions/sdk/write.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { SdkWritePrompts } from '../../../src/prompts/sdk/write.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { SdkContext } from '../../../src/types/sdk-context.js';
import { GENERATED_MARKER, YOURS_MARKER } from '../../../src/types/sdk/conflict-markers.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, SdkGeneration } from '../../../src/types/sdk/generation-record.js';
import { SdkDestination } from '../../../src/types/sdk/sdk-destination.js';
import { SdkRepositoryContext } from '../../../src/types/sdk-repository-context.js';
import { snapshotFiles } from '../../helpers/snapshots.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';

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

type Files = Record<string, string>;

const rel = (value: string) => RelativeFilePath.fromGit(value);

describe('SdkWriteAction', () => {
  let root: string;
  let sdkContext: SdkContext;
  let generations = 0;
  const git = new GitService();

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));
  const at = (relative: string) => path.join(sdk().toString(), relative);
  const read = (relative: string) => fs.readFileSync(at(relative), 'utf-8');
  const write = (directory: DirectoryPath, files: Files) => {
    for (const [relative, contents] of Object.entries(files)) {
      const target = path.join(directory.toString(), relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
  };
  const generated = (files: Files): DirectoryPath => {
    const directory = new DirectoryPath(path.join(root, `generated-${generations++}`));
    write(directory, files);
    return directory;
  };
  const record = () => GenerationRecord.parse(read('.apimatic/generation.json'))!;
  const execute = (destination: SdkDestination, files: Files) =>
    new SdkWriteAction().execute(destination, sdkContext, generated(files), STABLE);

  /** A first generation of `files`, written and recorded into the project's repository. */
  const recorded = async (files: Files): Promise<{ repository: SdkRepositoryContext; base: CommitId }> => {
    write(sdk(), files);
    await git.init(new DirectoryPath(root));
    const repository = (await sdkContext.repository())!;
    const tree = (await repository.snapshotGenerated(generated(files)))._unsafeUnwrap();
    const written = (await repository.recordGeneration(tree, STABLE, '0.0.0', []))._unsafeUnwrap();
    return { repository, base: written.pristineCommit() };
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-write-'));
    sdkContext = new SdkContext(Language.PYTHON, new DirectoryPath(path.join(root, 'sdk')));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('overwrite', () => {
    it('replaces the directory with the generated files, keeping a .git and writing no record', async () => {
      write(sdk(), { 'old.py': 'old', '.git/HEAD': 'ref: refs/heads/main' });
      const sdkGenerated = sinon.stub(SdkWritePrompts.prototype, 'sdkGenerated');

      expect((await execute({ kind: 'overwrite' }, { 'README.md': '# sdk' })).isSuccess()).to.be.true;

      expect(fs.readdirSync(sdk().toString()).sort()).to.deep.equal(['.git', 'README.md']);
      expect(sdkGenerated.firstCall.args[0].isEqual(sdk())).to.be.true;
    });
  });

  describe('record', () => {
    it('initialises a repository in the SDK directory, says so, and records the snapshot', async () => {
      const repositoryInitialised = sinon.stub(SdkWritePrompts.prototype, 'repositoryInitialised');

      const result = await execute(
        { kind: 'record', repository: undefined, remote: undefined },
        { 'README.md': '# sdk', 'a.py': 'x' }
      );

      expect(result.isSuccess()).to.be.true;
      expect(repositoryInitialised.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(fs.readFileSync(at('.git/HEAD'), 'utf-8').trim()).to.equal('ref: refs/heads/main');
      const pristine = (await git.resolveRef(sdk(), SnapshotRef.pristine('')))!;
      expect(record().pristineCommit().isEqual(pristine)).to.be.true;
      expect(record().isFor(STABLE)).to.be.true;
      const repository = (await sdkContext.repository())!;
      const files = await snapshotFiles(repository.root(), pristine);
      expect([...files.keys()]).to.have.members(['README.md', 'a.py']);
    });

    it('records into the enclosing repository under the SDK directory’s ref, keeping what was there out of it', async () => {
      write(sdk(), { 'old.py': 'old' });
      await git.init(new DirectoryPath(root));
      const repository = (await sdkContext.repository())!;
      const repositoryInitialised = sinon.stub(SdkWritePrompts.prototype, 'repositoryInitialised');

      expect((await execute({ kind: 'record', repository, remote: undefined }, { 'README.md': '# sdk' })).isSuccess())
        .to.be.true;

      expect(repositoryInitialised.called).to.be.false;
      expect(fs.existsSync(at('.git'))).to.be.false;
      expect(fs.existsSync(at('old.py'))).to.be.false;
      const ref = SnapshotRef.pristine('sdk/python');
      expect((await git.resolveRef(new DirectoryPath(root), ref))?.isEqual(record().pristineCommit())).to.be.true;
    });

    it('still succeeds, with a warning, when the snapshot cannot be recorded', async () => {
      sinon
        .stub(SdkRepositoryContext.prototype, 'recordGeneration')
        .resolves(err({ kind: 'gitFailed', reason: 'git broke' }));
      const snapshotNotRecorded = sinon.stub(SdkWritePrompts.prototype, 'snapshotNotRecorded');

      expect(
        (
          await execute({ kind: 'record', repository: undefined, remote: undefined }, { 'README.md': '# sdk' })
        ).isSuccess()
      ).to.be.true;

      expect(read('README.md')).to.equal('# sdk');
      expect(snapshotNotRecorded.firstCall.args[0]).to.equal('git broke');
    });
  });

  describe('merge', () => {
    it('merges the generator’s changes into your edited files, adds new files and keeps your own', async () => {
      const { repository, base } = await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      write(sdk(), { 'models/book.py': DECORATED + MODEL_V1, 'notes.txt': 'mine' });
      const sdkMerged = sinon.stub(SdkWritePrompts.prototype, 'sdkMerged');

      const result = await execute(
        { kind: 'merge', repository, base, remote: undefined },
        { 'README.md': '# sdk v2', 'models/book.py': MODEL_V2, 'models/author.py': 'class Author: ...' }
      );

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
        kept: []
      });
      expect(record().pristineCommit().isEqual(base)).to.be.false;
      expect(record().hasConflicts()).to.be.false;
      expect((await git.describe(repository.root(), record().pristineCommit())).parents).to.deep.equal([base]);
      const previous = (await git.resolveRef(repository.root(), repository.previousRef()))!;
      const kept = await snapshotFiles(repository.root(), previous);
      expect(kept.get('models/book.py')).to.equal(DECORATED + MODEL_V1);
    });

    it('writes markers where you and the generator changed the same lines, lists the file and fails', async () => {
      const { repository, base } = await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      write(sdk(), { 'models/book.py': MODEL_V1_EDITED });
      const conflicts = sinon.stub(SdkWritePrompts.prototype, 'conflicts');

      const result = await execute(
        { kind: 'merge', repository, base, remote: undefined },
        { 'README.md': '# sdk v2', 'models/book.py': MODEL_V2 }
      );

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
      expect(record().conflictedPaths().map(String)).to.deep.equal(['models/book.py']);
      expect(result.getError()?.conflictsByKind()).to.include({ bothChanged: 1, noLongerGenerated: 0 });
      const cwd = repository.root().toString();
      expect((await execa('git', ['status', '--porcelain'], { cwd })).stdout).to.contain(
        'UU sdk/python/models/book.py'
      );
      const staged = (await execa('git', ['ls-files', '--stage', '--', 'sdk/python/models/book.py'], { cwd })).stdout;
      expect(staged.split('\n').map((line) => line.split(/\s+/)[2])).to.deep.equal(['1', '2', '3']);
    });

    it('still reports the conflicts when they cannot be marked in the index, with a warning', async () => {
      const { repository, base } = await recorded({ 'README.md': '# sdk', 'models/book.py': MODEL_V1 });
      write(sdk(), { 'models/book.py': MODEL_V1_EDITED });
      sinon
        .stub(SdkRepositoryContext.prototype, 'stageConflicts')
        .resolves(err({ kind: 'gitFailed', reason: 'index locked' }));
      const conflictsNotStaged = sinon.stub(SdkWritePrompts.prototype, 'conflictsNotStaged');
      const conflicts = sinon.stub(SdkWritePrompts.prototype, 'conflicts');

      const result = await execute(
        { kind: 'merge', repository, base, remote: undefined },
        { 'models/book.py': MODEL_V2 }
      );

      expect(result.isFailed()).to.be.true;
      expect(result.getMessage()).to.equal('Resolve the conflicts and rerun');
      expect(conflictsNotStaged.firstCall.args[0]).to.equal('index locked');
      expect(conflicts.called).to.be.true;
      expect(read('models/book.py')).to.contain(YOURS_MARKER);
    });

    it('leaves the directory alone when the pre-run state cannot be kept', async () => {
      const { repository, base } = await recorded({ 'README.md': '# sdk' });
      write(sdk(), { 'README.md': '# edited' });
      sinon
        .stub(SdkRepositoryContext.prototype, 'savePrevious')
        .resolves(err({ kind: 'gitFailed', reason: 'git broke' }));
      const customCodeFailed = sinon.stub(SdkWritePrompts.prototype, 'customCodeFailed');

      expect(
        (await execute({ kind: 'merge', repository, base, remote: undefined }, { 'README.md': '# sdk v2' })).isFailed()
      ).to.be.true;

      expect(read('README.md')).to.equal('# edited');
      expect(record().pristineCommit().isEqual(base)).to.be.true;
      expect(customCodeFailed.firstCall.args[0]).to.equal('git broke');
    });
  });

  describe('sharing the snapshot', () => {
    beforeEach(() => {
      sinon.stub(SdkWritePrompts.prototype, 'repositoryInitialised');
    });

    it('pushes it to the remote the destination names, and says so', async () => {
      const share = sinon.stub(SdkRepositoryContext.prototype, 'shareSnapshot').resolves(ok('pushed'));
      const snapshotShared = sinon.stub(SdkWritePrompts.prototype, 'snapshotShared');

      const result = await execute(
        { kind: 'record', repository: undefined, remote: 'origin' },
        { 'README.md': '# sdk' }
      );

      expect(result.isSuccess()).to.be.true;
      expect(share.firstCall.args[0]).to.equal('origin');
      expect(snapshotShared.firstCall.args).to.deep.equal(['origin']);
    });

    it('says nothing when the remote already had it', async () => {
      sinon.stub(SdkRepositoryContext.prototype, 'shareSnapshot').resolves(ok('upToDate'));
      const snapshotShared = sinon.stub(SdkWritePrompts.prototype, 'snapshotShared');

      expect(
        (
          await execute({ kind: 'record', repository: undefined, remote: 'origin' }, { 'README.md': '# sdk' })
        ).isSuccess()
      ).to.be.true;

      expect(snapshotShared.called).to.be.false;
    });

    it('warns, and still succeeds, when the push fails', async () => {
      sinon
        .stub(SdkRepositoryContext.prototype, 'shareSnapshot')
        .resolves(err({ kind: 'gitFailed', reason: 'no access' }));
      const snapshotNotShared = sinon.stub(SdkWritePrompts.prototype, 'snapshotNotShared');

      const result = await execute(
        { kind: 'record', repository: undefined, remote: 'origin' },
        { 'README.md': '# sdk' }
      );

      expect(result.isSuccess()).to.be.true;
      expect(snapshotNotShared.firstCall.args).to.deep.equal(['origin', 'no access']);
    });

    it('leaves the remote alone when the destination names none', async () => {
      const share = sinon.stub(SdkRepositoryContext.prototype, 'shareSnapshot');

      expect(
        (
          await execute({ kind: 'record', repository: undefined, remote: undefined }, { 'README.md': '# sdk' })
        ).isSuccess()
      ).to.be.true;

      expect(share.called).to.be.false;
    });
  });
});
