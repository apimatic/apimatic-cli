import { expect } from 'chai';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';

describe('SnapshotRef', () => {
  it('names a ref after the SDK directory, and the namespace alone for a repository that is one', () => {
    expect(SnapshotRef.pristine('sdk/typescript').toString()).to.equal('refs/apimatic/pristine/sdk/typescript');
    expect(SnapshotRef.previous('sdk/typescript').toString()).to.equal('refs/apimatic/previous/sdk/typescript');
    expect(SnapshotRef.pristine('').toString()).to.equal('refs/apimatic/pristine');
  });

  it('spells a path git would refuse as a ref name in %XX, and reads it back', () => {
    const ref = SnapshotRef.pristine('My API/sdk/.typescript/v1.lock/café~2');

    expect(ref.toString()).to.equal('refs/apimatic/pristine/My%20API/sdk/%2Etypescript/v1%2Elock/caf%C3%A9%7E2');
    expect(ref.sdkPath()).to.equal('My API/sdk/.typescript/v1.lock/café~2');
    expect(SnapshotRef.fromGit(ref.toString()).isEqual(ref)).to.be.true;
    expect(SnapshotRef.fromGit('refs/apimatic/pristine').sdkPath()).to.equal('');
    expect(SnapshotRef.previous('sdk/typescript').sdkPath()).to.equal('sdk/typescript');
  });

  it('maps itself onto itself for push and fetch, forced when the other side may have moved on', () => {
    const ref = SnapshotRef.pristine('sdk/typescript');

    expect(ref.refspec()).to.equal('refs/apimatic/pristine/sdk/typescript:refs/apimatic/pristine/sdk/typescript');
    expect(ref.forcedRefspec()).to.equal(
      '+refs/apimatic/pristine/sdk/typescript:refs/apimatic/pristine/sdk/typescript'
    );
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
