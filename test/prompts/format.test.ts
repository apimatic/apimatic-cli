import path from 'node:path';
import { expect } from 'chai';
import { format } from '../../src/prompts/format.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';

// `DirectoryPath` resolves on construction, so every path the CLI holds is absolute. The commands
// that print one for a reader to read or paste — `sdk generate`'s destination, the `cd` line in
// `plugin publish` — want it as that reader would type it from where they are standing.
describe('format.relative', () => {
  const here = (...parts: string[]) => new DirectoryPath(path.join(process.cwd(), ...parts));

  it('writes a directory below the current one as a relative path', () => {
    expect(format.relative(here('plugin'))).to.equal('./plugin');
  });

  it('keeps posix separators on every platform, because the line is pasted into a shell', () => {
    expect(format.relative(here('sdk', 'typescript'))).to.equal('./sdk/typescript');
  });

  // Above or outside the working directory there is no short form worth reading: `../../..` tells
  // a reader less than the path itself.
  it('leaves a directory outside the current one absolute', () => {
    const outside = new DirectoryPath(path.resolve(process.cwd(), '..'));

    expect(format.relative(outside)).to.equal(String(outside));
  });

  it('names the directory the command was run in as the one you are standing in', () => {
    const cwd = new DirectoryPath(process.cwd());

    expect(format.relative(cwd)).to.equal('.');
  });

  // `..cache` is a child, not a sibling: only a whole `..` segment leaves the directory.
  it('keeps a child whose name merely begins with dots relative', () => {
    const dotted = new DirectoryPath(process.cwd()).join('..cache');

    expect(format.relative(dotted)).to.equal('./..cache');
  });
});
