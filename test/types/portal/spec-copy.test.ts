import path from 'path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { SpecCopy } from '../../../src/types/portal/spec-copy';

describe('SpecCopy', () => {
  const original = new DirectoryPath(path.resolve('project', 'src', 'spec'));
  const copy = new DirectoryPath(path.resolve('tmp', 'build', 'spec'));
  const posix = (directory: DirectoryPath) => directory.toString().split(path.sep).join('/');

  it('points a path in native form back at the original directory', () => {
    const log = `Failed to read ${path.join(copy.toString(), 'api.yaml')}`;

    expect(SpecCopy.of(original, copy).restorePaths(log)).to.equal(
      `Failed to read ${path.join(original.toString(), 'api.yaml')}`
    );
  });

  it('points a path in POSIX form back at the original directory', () => {
    const log = `[OpenAPI] Failed to resolve $ref in ${posix(copy)}/api.yaml: ./missing.yaml`;

    expect(SpecCopy.of(original, copy).restorePaths(log)).to.equal(
      `[OpenAPI] Failed to resolve $ref in ${posix(original)}/api.yaml: ./missing.yaml`
    );
  });

  it('leaves the text alone when there is no copy', () => {
    const log = `Failed to read ${path.join(copy.toString(), 'api.yaml')}`;

    expect(SpecCopy.none().restorePaths(log)).to.equal(log);
  });
});
