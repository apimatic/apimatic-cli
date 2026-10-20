import { expect } from 'chai';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';

describe('SnapshotRef', () => {
  it('names a ref after the SDK directory, and the namespace alone for a repository that is one', () => {
    expect(SnapshotRef.pristine('sdk/typescript').toString()).to.equal('refs/apimatic/pristine/sdk/typescript');
    expect(SnapshotRef.previous('sdk/typescript').toString()).to.equal('refs/apimatic/previous/sdk/typescript');
    expect(SnapshotRef.pristine('').toString()).to.equal('refs/apimatic/pristine');
  });

  it('collides only with a ref on its own path, in either direction', () => {
    const typescript = SnapshotRef.pristine('sdk/typescript');

    expect(typescript.collidesWith(SnapshotRef.pristine('sdk/typescript/typescript'))).to.be.true;
    expect(typescript.collidesWith(SnapshotRef.pristine('sdk'))).to.be.true;
    expect(typescript.collidesWith(SnapshotRef.pristine(''))).to.be.true;
    expect(typescript.collidesWith(SnapshotRef.pristine('sdk/typescript'))).to.be.false;
    expect(typescript.collidesWith(SnapshotRef.pristine('sdk/typescript-v2'))).to.be.false;
    expect(typescript.collidesWith(SnapshotRef.pristine('sdk/python'))).to.be.false;
  });
});
