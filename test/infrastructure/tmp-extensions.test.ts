import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { withDirPath } from '../../src/infrastructure/tmp-extensions';

// The portal's dev server resolves its allow-list to real paths and then compares strings, so a
// temp directory named any other way than its real one has every page under it refused.
describe('the temp directory a run is given', () => {
  it('is spelled the way the filesystem spells it', async () => {
    await withDirPath(async (directory) => {
      expect(directory.toString()).to.equal(fs.realpathSync.native(directory.toString()));
    });
  });

  it('exists while the callback runs and is gone afterwards', async () => {
    let seen: string | undefined;

    await withDirPath(async (directory) => {
      seen = directory.toString();
      expect(fs.existsSync(seen)).to.be.true;
      fs.writeFileSync(path.join(seen, 'marker.txt'), 'x');
    });

    expect(seen).to.be.a('string');
    expect(fs.existsSync(seen as string)).to.be.false;
  });
});
