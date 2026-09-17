import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { BUILD_DIRECTORY_NAME, buildDirectoryBase, withBuildDirectory } from '../../src/infrastructure/tmp-extensions';
import { DirectoryPath } from '../../src/types/file/directoryPath';

describe('buildDirectoryBase', () => {
  const source = new DirectoryPath('D:\\work\\my-api\\src');

  it('uses the system temp directory when it shares the drive with the source', () => {
    expect(buildDirectoryBase(source, 'D:\\Temp', 'win32')).to.equal('D:\\Temp');
  });

  it('compares drive letters without regard to case', () => {
    expect(buildDirectoryBase(source, 'd:\\Temp', 'win32')).to.equal('d:\\Temp');
  });

  it('falls back to a folder beside the source when the temp directory is on another drive', () => {
    // Vite cannot express a relative path across drives, so the content pages would vanish.
    expect(buildDirectoryBase(source, 'C:\\Users\\me\\AppData\\Local\\Temp', 'win32')).to.equal(
      path.win32.join('D:\\work\\my-api', BUILD_DIRECTORY_NAME)
    );
  });

  it('never leaves the system temp directory on other platforms', () => {
    expect(buildDirectoryBase(new DirectoryPath('/work/my-api/src'), '/tmp', 'linux')).to.equal('/tmp');
    expect(buildDirectoryBase(new DirectoryPath('/work/my-api/src'), '/tmp', 'darwin')).to.equal('/tmp');
  });
});

describe('withBuildDirectory', () => {
  it('hands out a directory that exists while the callback runs and is gone afterwards', async () => {
    const source = new DirectoryPath(fs.mkdtempSync(path.join(os.tmpdir(), 'build-source-'))).join('src');
    let seen: string | undefined;

    await withBuildDirectory(source, async (directory) => {
      seen = directory.toString();
      expect(fs.existsSync(seen)).to.be.true;
      fs.writeFileSync(path.join(seen, 'marker.txt'), 'x');
    });

    expect(seen).to.be.a('string');
    expect(fs.existsSync(seen as string)).to.be.false;
  });

  // Drive letters only exist on Windows, so the fallback can only be exercised for real there.
  (process.platform === 'win32' ? it : it.skip)(
    'builds beside the source when the temp directory is on another drive, and cleans up',
    async () => {
      const project = fs.mkdtempSync(path.join(os.tmpdir(), 'build-project-'));
      const source = new DirectoryPath(project).join('src');
      const foreignTemp = 'Z:\\Temp';
      const fallback = path.join(project, BUILD_DIRECTORY_NAME);

      await withBuildDirectory(
        source,
        async (directory) => {
          expect(directory.toString().toLowerCase().startsWith(fallback.toLowerCase())).to.be.true;
          expect(fs.readFileSync(path.join(fallback, '.gitignore'), 'utf8')).to.equal('*\n');
        },
        foreignTemp
      );

      expect(fs.existsSync(fallback)).to.be.false;
    }
  );
});
