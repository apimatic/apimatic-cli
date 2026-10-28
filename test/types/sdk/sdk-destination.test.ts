import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { destinationFor, replacesDirectory, SdkDestination } from '../../../src/types/sdk/sdk-destination.js';
import { SdkRepositoryContext } from '../../../src/types/sdk-repository-context.js';

describe('SdkDestination', () => {
  const root = new DirectoryPath(process.cwd());
  const repository = SdkRepositoryContext.create(root, root.join('sdk', 'python'))!;
  const base = CommitId.fromGit('a'.repeat(40))!;

  it('merges against the recorded base when the repository is ready, and asks nothing', () => {
    const destination = destinationFor(repository, { kind: 'ready', base });

    expect(destination).to.deep.equal({ kind: 'merge', repository, base });
    expect(destination.kind !== 'unresolved' && replacesDirectory(destination)).to.be.false;
  });

  it('records a fresh snapshot otherwise, carrying why, which the overwrite question follows', () => {
    const recorded = { language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.BETA };
    const states = [
      { kind: 'noRecord' as const },
      { kind: 'otherGeneration' as const, recorded },
      { kind: 'snapshotMissing' as const, fetch: { kind: 'noRemote' as const } }
    ];

    const destinations = states.map((state) => destinationFor(repository, state));

    expect(destinations).to.deep.equal(states.map((because) => ({ kind: 'record', repository, because })));
    expect(
      destinations.map((destination) => destination.kind !== 'unresolved' && replacesDirectory(destination))
    ).to.deep.equal([true, true, true]);
  });

  it('decides nothing while the last run’s markers are still in the files, naming them for the question', () => {
    const paths = [RelativeFilePath.fromGit('a.py')!];

    expect(destinationFor(repository, { kind: 'unresolved', paths })).to.deep.equal({
      kind: 'unresolved',
      repository,
      paths
    });
  });

  it('replaces the directory when git cannot keep anything', () => {
    const destination: SdkDestination = { kind: 'overwrite', found: undefined };

    expect(replacesDirectory(destination)).to.be.true;
  });
});
