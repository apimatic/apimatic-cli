import path from 'node:path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { SdkPath } from '../../../src/types/sdk/sdk-path.js';

describe('SdkPath', () => {
  const root = new DirectoryPath(path.resolve('project'));

  it('spells the SDK directory below the root as git does, and finds it again under the root', () => {
    const nested = SdkPath.of(root, root.join('sdk', 'My API'));
    const own = SdkPath.of(root, root);

    expect(nested.toString()).to.equal('sdk/My API');
    expect(nested.isRoot()).to.be.false;
    expect(nested.in(root).isEqual(root.join('sdk', 'My API'))).to.be.true;
    expect(own.toString()).to.equal('');
    expect(own.isRoot()).to.be.true;
    expect(own.in(root).isEqual(root)).to.be.true;
  });

  it('names a pathspec for a git command run at the root, `.` for the root itself', () => {
    expect(SdkPath.fromGit('sdk/python')!.pathspec()).to.equal('sdk/python');
    expect(SdkPath.fromGit('')!.pathspec()).to.equal('.');
  });

  it('turns a path below the SDK directory into one from the root, and back', () => {
    const sdk = SdkPath.fromGit('sdk/python')!;
    const file = RelativeFilePath.fromGit('models/book.py')!;

    expect(sdk.fromRoot(file).toString()).to.equal('sdk/python/models/book.py');
    expect(sdk.below(RelativeFilePath.fromGit('sdk/python/models/book.py')!)?.toString()).to.equal('models/book.py');
    expect(sdk.below(RelativeFilePath.fromGit('docs/index.md')!)).to.be.undefined;
    expect(SdkPath.fromGit('')!.fromRoot(file).isEqual(file)).to.be.true;
  });

  it('knows when two SDK directories nest, which refs as files cannot allow', () => {
    const sdk = SdkPath.fromGit('sdk')!;
    const inner = SdkPath.fromGit('sdk/python')!;

    expect(sdk.nests(inner)).to.be.true;
    expect(inner.nests(sdk)).to.be.true;
    expect(SdkPath.fromGit('')!.nests(inner)).to.be.true;
    expect(inner.nests(SdkPath.fromGit('sdk/typescript')!)).to.be.false;
    expect(inner.nests(inner)).to.be.false;
    expect(SdkPath.fromGit('sdk')!.nests(SdkPath.fromGit('sdk2')!)).to.be.false;
  });
});
