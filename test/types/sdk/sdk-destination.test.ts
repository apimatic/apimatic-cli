import { expect } from 'chai';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import {
  destinationFor,
  replacesDirectory,
  SdkDestination,
  SdkRepositoryState
} from '../../../src/actions/sdk/generate.js';

describe('SdkDestination', () => {
  const repository = 'the repository';
  const base = CommitId.fromGit('a'.repeat(40))!;
  const found = (state: SdkRepositoryState) => destinationFor(repository, state);

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

  it('replaces the directory when git cannot keep anything, and when there is no repository to record in', () => {
    const overwrite: SdkDestination = { kind: 'overwrite', found: undefined };
    const noRepository: SdkDestination = { kind: 'noRepository' };

    expect(replacesDirectory(overwrite)).to.be.true;
    expect(replacesDirectory(noRepository)).to.be.true;
  });
});
