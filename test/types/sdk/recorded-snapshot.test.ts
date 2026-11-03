import { expect } from 'chai';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { RemoteName } from '../../../src/types/git/remote-name.js';
import { RecordedSnapshot } from '../../../src/types/sdk/recorded-snapshot.js';
import { SnapshotFetch } from '../../../src/types/sdk/snapshot-fetch.js';
import { fetchKind } from '../../helpers/snapshots.js';

const BASE = CommitId.fromGit('a'.repeat(40))!;
const ORIGIN = RemoteName.origin();

describe('RecordedSnapshot', () => {
  it('has nothing to merge against, to fetch or to warn about when nothing is recorded for the generation', () => {
    const none = RecordedSnapshot.none();

    expect(none.mergeBase()).to.be.undefined;
    expect(none.toFetch()).to.be.undefined;
    expect(none.isMissing()).to.be.false;
    expect(fetchKind(none.fetch)).to.equal('none');
  });

  it('merges against the recorded snapshot while the repository holds it, and has it fetched when it does not', () => {
    const held = RecordedSnapshot.of(BASE, true);
    const missing = RecordedSnapshot.of(BASE, false);

    expect(held.mergeBase()).to.deep.equal(BASE);
    expect(held.toFetch()).to.be.undefined;
    expect(held.isMissing()).to.be.false;
    expect(missing.mergeBase()).to.be.undefined;
    expect(missing.toFetch()).to.deep.equal(BASE);
    expect(missing.isMissing()).to.be.true;
    expect(fetchKind(missing.fetch)).to.equal('none');
  });

  it('is held once a fetch brought it, and still missing otherwise, saying where it was looked for', () => {
    const missing = RecordedSnapshot.of(BASE, false);

    const brought = missing.brought();
    const absent = missing.stillMissing(SnapshotFetch.absent(ORIGIN));
    const failed = missing.stillMissing(SnapshotFetch.failed(ORIGIN, 'the remote did not answer within 30 seconds'));
    const noRemote = missing.stillMissing(SnapshotFetch.none());

    expect(brought.mergeBase()).to.deep.equal(BASE);
    expect(brought.isMissing()).to.be.false;
    expect(brought.toFetch()).to.be.undefined;
    expect([absent, failed, noRemote].map((snapshot) => snapshot.isMissing())).to.deep.equal([true, true, true]);
    expect([absent, failed, noRemote].map((snapshot) => snapshot.mergeBase())).to.deep.equal([
      undefined,
      undefined,
      undefined
    ]);
    expect(fetchKind(absent.fetch)).to.equal('absent origin');
    expect(fetchKind(failed.fetch)).to.equal('failed origin: the remote did not answer within 30 seconds');
    expect(fetchKind(noRemote.fetch)).to.equal('none');
    expect(missing.isMissing()).to.be.true;
  });
});

describe('SnapshotFetch', () => {
  it('is rendered by the handler for what it came to, handed the remote and the reason', () => {
    const rendered = (fetch: SnapshotFetch) =>
      fetch.match({
        none: () => 'nowhere',
        absent: (remote) => `not on ${remote}`,
        failed: (remote, reason) => `${remote} failed: ${reason}`
      });

    expect(rendered(SnapshotFetch.none())).to.equal('nowhere');
    expect(rendered(SnapshotFetch.absent(RemoteName.fromGit('fork')!))).to.equal('not on fork');
    expect(rendered(SnapshotFetch.failed(ORIGIN, 'git broke'))).to.equal('origin failed: git broke');
  });
});
