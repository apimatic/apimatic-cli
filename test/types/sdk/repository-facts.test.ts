import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { RemoteName } from '../../../src/types/git/remote-name.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord } from '../../../src/types/sdk/generation-record.js';
import { SdkGeneration } from '../../../src/types/sdk/sdk-generation.js';
import { afterFetch, classify, RepositoryFacts } from '../../../src/actions/sdk/generate.js';

const PYTHON = SdkGeneration.create({
  language: Language.PYTHON,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
})!;
const TYPESCRIPT = SdkGeneration.create({
  language: Language.TYPESCRIPT,
  codegenVersion: CodeGenerationVersion.V4,
  stability: Stability.STABLE
})!;

const base = CommitId.fromGit('a'.repeat(40))!;
const root = new DirectoryPath(process.cwd());
const origin = RemoteName.origin();

/** A repository with a record for Python whose base is here, and nothing else in the way. */
const ready: RepositoryFacts = {
  root,
  operation: undefined,
  unresolved: [],
  record: GenerationRecord.written(PYTHON, base),
  baseHere: true,
  remote: origin
};

describe('classify', () => {
  it('refuses an operation in progress before anything else', () => {
    const busy = { ...ready, operation: 'rebase' as const, unresolved: [RelativeFilePath.fromGit('a.py')!] };

    expect(classify(busy, PYTHON)._unsafeUnwrapErr()).to.deep.equal({
      kind: 'operationInProgress',
      operation: 'rebase',
      root
    });
  });

  it('puts unmerged files before the record, whatever the record says', () => {
    const paths = [RelativeFilePath.fromGit('a.py')!];

    expect(classify({ ...ready, unresolved: paths, record: undefined }, PYTHON)._unsafeUnwrap()).to.deep.equal({
      kind: 'unresolved',
      paths
    });
  });

  it('reads the record: none, another generation, or this one', () => {
    expect(classify({ ...ready, record: undefined }, PYTHON)._unsafeUnwrap()).to.deep.equal({ kind: 'noRecord' });
    expect(classify(ready, TYPESCRIPT)._unsafeUnwrap()).to.deep.equal({ kind: 'otherGeneration' });
    expect(classify(ready, PYTHON)._unsafeUnwrap()).to.deep.equal({ kind: 'ready', base });
  });

  it('asks for a fetch only when the base is elsewhere and there is a remote to ask', () => {
    expect(classify({ ...ready, baseHere: false }, PYTHON)._unsafeUnwrap()).to.deep.equal({
      kind: 'fetchNeeded',
      base,
      remote: origin
    });
    expect(classify({ ...ready, baseHere: false, remote: undefined }, PYTHON)._unsafeUnwrap()).to.deep.equal({
      kind: 'snapshotMissing',
      fetch: { kind: 'noRemote' }
    });
  });
});

describe('afterFetch', () => {
  const needed = { kind: 'fetchNeeded' as const, base, remote: origin };

  it('is ready when the fetch brought the base, and says why not otherwise', () => {
    expect(afterFetch(needed, { kind: 'fetched', baseHere: true })).to.deep.equal({ kind: 'ready', base });
    expect(afterFetch(needed, { kind: 'fetched', baseHere: false })).to.deep.equal({
      kind: 'snapshotMissing',
      fetch: { kind: 'absent', remote: origin }
    });
    expect(afterFetch(needed, { kind: 'failed', reason: 'timed out' })).to.deep.equal({
      kind: 'snapshotMissing',
      fetch: { kind: 'failed', remote: origin, reason: 'timed out' }
    });
  });
});
