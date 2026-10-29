import { expect } from 'chai';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';

describe('SnapshotRef', () => {
  it('names the two refs the SDK directory’s own repository keeps', () => {
    expect(SnapshotRef.pristine().toString()).to.equal('refs/apimatic/pristine');
    expect(SnapshotRef.previous().toString()).to.equal('refs/apimatic/previous');
  });
});
