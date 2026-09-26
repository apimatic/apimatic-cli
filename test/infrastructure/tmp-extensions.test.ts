import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import {
  canonical,
  PORTAL_PROJECT_DIRECTORY_NAME,
  portalProjectDirectoryBase,
  withDirPath,
  withPortalProjectDirectory
} from '../../src/infrastructure/tmp-extensions';
import { DirectoryPath } from '../../src/types/file/directoryPath';

describe('portalProjectDirectoryBase', () => {
  // A plain string, not a DirectoryPath: that class resolves against the host's own path
  // rules, and this Windows path is checked on every platform.
  const source = 'D:\\work\\my-api\\src';

  it('uses the system temp directory when it shares the drive with the source', () => {
    expect(portalProjectDirectoryBase(source, 'D:\\Temp', 'win32')).to.equal('D:\\Temp');
  });

  it('compares drive letters without regard to case', () => {
    expect(portalProjectDirectoryBase(source, 'd:\\Temp', 'win32')).to.equal('d:\\Temp');
  });

  it('falls back to a folder beside the source when the temp directory is on another drive', () => {
    expect(portalProjectDirectoryBase(source, 'C:\\Users\\me\\AppData\\Local\\Temp', 'win32')).to.equal(
      path.win32.join('D:\\work\\my-api', PORTAL_PROJECT_DIRECTORY_NAME)
    );
  });

  it('never leaves the system temp directory on other platforms', () => {
    expect(portalProjectDirectoryBase('/work/my-api/src', '/tmp', 'linux')).to.equal('/tmp');
    expect(portalProjectDirectoryBase('/work/my-api/src', '/tmp', 'darwin')).to.equal('/tmp');
  });
});

// The portal's dev server resolves its allow-list to real paths and then compares strings, so a
// temp directory named any other way than its real one has every page under it refused.
describe('the temp directory a run is given', () => {
  it('is spelled the way the filesystem spells it', async () => {
    await withDirPath(async (directory) => {
      expect(directory.toString()).to.equal(fs.realpathSync.native(directory.toString()));
    });
  });

  it('is spelled that way for a portal project too', async () => {
    const source = new DirectoryPath(fs.mkdtempSync(path.join(os.tmpdir(), 'build-real-'))).join('src');

    await withPortalProjectDirectory(source, async (directory) => {
      expect(directory.toString()).to.equal(fs.realpathSync.native(directory.toString()));
    });
  });
});

describe('withPortalProjectDirectory', () => {
  it('hands out a directory that exists while the callback runs and is gone afterwards', async () => {
    const source = new DirectoryPath(fs.mkdtempSync(path.join(os.tmpdir(), 'build-source-'))).join('src');
    let seen: string | undefined;

    await withPortalProjectDirectory(source, async (directory) => {
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
      const project = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'build-project-')));
      const source = new DirectoryPath(project).join('src');
      const foreignTemp = 'Z:\\Temp';
      const fallback = path.join(project, PORTAL_PROJECT_DIRECTORY_NAME);

      await withPortalProjectDirectory(
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

  (process.platform === 'win32' ? it : it.skip)(
    'leaves the shared folder alone while another run is in it',
    async () => {
      const project = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'build-shared-')));
      const source = new DirectoryPath(project).join('src');
      const fallback = path.join(project, PORTAL_PROJECT_DIRECTORY_NAME);

      await withPortalProjectDirectory(
        source,
        async () => {
          // Stands in for a second run still building in the same folder.
          fs.mkdirSync(path.join(fallback, 'another-run'), { recursive: true });
        },
        'Z:\\Temp'
      );

      expect(fs.existsSync(path.join(fallback, '.gitignore')), 'the marker survives').to.be.true;
      expect(fs.existsSync(path.join(fallback, 'another-run')), "the other run's directory survives").to.be.true;

      fs.rmSync(project, { recursive: true, force: true });
    }
  );
});
