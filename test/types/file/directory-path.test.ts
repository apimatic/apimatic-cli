import path from 'node:path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';

// `DirectoryPath` resolves on construction, so every path the CLI holds is absolute. A command
// that prints one for a reader to read or paste wants it as that reader would type it.
describe('DirectoryPath.relativeTo', () => {
  const base = new DirectoryPath(path.join('/', 'projects', 'petstore-api'));
  const from = (...parts: string[]) => new DirectoryPath(path.join(base.toString(), ...parts));

  it('writes a directory below the base as a relative path', () => {
    expect(from('plugin').relativeTo(base)).to.equal('./plugin');
  });

  // The result is pasted into a shell, where a backslash is an escape rather than a separator.
  it('keeps posix separators on every platform', () => {
    expect(from('sdk', 'typescript').relativeTo(base)).to.equal('./sdk/typescript');
  });

  // Above or outside the base there is no short form worth reading: `../../..` tells a reader
  // less than the path itself does.
  it('leaves a directory outside the base absolute', () => {
    const outside = new DirectoryPath(path.join('/', 'projects', 'other-api'));

    expect(outside.relativeTo(base)).to.equal(outside.toString());
  });

  it('leaves the base itself absolute, having nothing shorter to say', () => {
    expect(base.relativeTo(base)).to.equal(base.toString());
  });
});
