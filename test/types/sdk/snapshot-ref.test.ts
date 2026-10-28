import { expect } from 'chai';
import { SdkPath } from '../../../src/types/sdk/sdk-path.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';

describe('SnapshotRef', () => {
  it('names a ref after the SDK directory, and the namespace alone for a repository that is one', () => {
    expect(SnapshotRef.pristine(SdkPath.fromGit('sdk/typescript')).toString()).to.equal(
      'refs/apimatic/pristine/sdk/typescript'
    );
    expect(SnapshotRef.previous(SdkPath.fromGit('sdk/typescript')).toString()).to.equal(
      'refs/apimatic/previous/sdk/typescript'
    );
    expect(SnapshotRef.pristine(SdkPath.fromGit('')).toString()).to.equal('refs/apimatic/pristine');
  });

  it('spells a path git would refuse as a ref name in %XX, and reads it back', () => {
    const ref = SnapshotRef.pristine(SdkPath.fromGit('My API/sdk/.typescript/v1.lock/café~2'));

    expect(ref.toString()).to.equal('refs/apimatic/pristine/My%20API/sdk/%2Etypescript/v1%2Elock/caf%C3%A9%7E2');
    expect(ref.sdkPath().toString()).to.equal('My API/sdk/.typescript/v1.lock/café~2');
    expect(SnapshotRef.fromGit(ref.toString()).toString()).to.equal(ref.toString());
    expect(SnapshotRef.fromGit('refs/apimatic/pristine').sdkPath().toString()).to.equal('');
    expect(SnapshotRef.previous(SdkPath.fromGit('sdk/typescript')).sdkPath().toString()).to.equal('sdk/typescript');
  });
});
