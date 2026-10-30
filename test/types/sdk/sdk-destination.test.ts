import { expect } from 'chai';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
import { destinationFor, replacesDirectory, SdkDestination } from '../../../src/types/sdk/sdk-destination.js';
import { SdkRepositoryState } from '../../../src/types/sdk/repository-state.js';

describe('SdkDestination', () => {
  const repository = 'the repository';
  const git = GitVersion.parse('git version 2.47.1')!;
  const base = CommitId.fromGit('a'.repeat(40))!;
  const found = (state: SdkRepositoryState) => destinationFor({ git, repository: { handle: repository, state } });

  it('overwrites without a git that can merge, whether git is missing or too old, and asks the repository nothing', () => {
    const old = GitVersion.parse('git version 2.37.0')!;

    expect(destinationFor({ git: undefined, repository: undefined })).to.deep.equal({
      kind: 'overwrite',
      found: undefined
    });
    expect(destinationFor({ git: old, repository: undefined })).to.deep.equal({ kind: 'overwrite', found: old });
  });

  it('has no repository to record in when a supported git finds none enclosing the directory', () => {
    expect(destinationFor({ git, repository: undefined })).to.deep.equal({ kind: 'noRepository' });
  });

  it('merges against the recorded base when the repository is ready, and asks nothing', () => {
    const destination = found({ kind: 'ready', base });

    expect(destination).to.deep.equal({ kind: 'merge', repository, base });
    expect(destination.kind !== 'unresolved' && replacesDirectory(destination)).to.be.false;
  });

  it('records a fresh snapshot otherwise, carrying why, which the overwrite question follows', () => {
    const states = [
      { kind: 'noRecord' as const },
      { kind: 'otherGeneration' as const },
      { kind: 'snapshotMissing' as const, fetch: { kind: 'noRemote' as const } }
    ];

    const destinations = states.map(found);

    expect(destinations).to.deep.equal(states.map((because) => ({ kind: 'record', repository, because })));
    expect(
      destinations.map((destination) => destination.kind !== 'unresolved' && replacesDirectory(destination))
    ).to.deep.equal([true, true, true]);
  });

  it('decides nothing while the last run’s markers are still in the files, naming them for the question', () => {
    const paths = [RelativeFilePath.fromGit('a.py')!];

    expect(found({ kind: 'unresolved', paths })).to.deep.equal({ kind: 'unresolved', repository, paths });
  });

  it('replaces the directory when git cannot keep anything', () => {
    const destination: SdkDestination = { kind: 'overwrite', found: undefined };

    expect(replacesDirectory(destination)).to.be.true;
  });
});
