import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect } from 'chai';
import sinon from 'sinon';
import { FileService } from '../../../../src/infrastructure/file-service';
import { ZipService } from '../../../../src/infrastructure/zip-service';
import { FilePath } from '../../../../src/types/file/filePath';
import { FileName } from '../../../../src/types/file/fileName';
import { DirectoryPath } from '../../../../src/types/file/directoryPath';
import { BundlePage, CopilotBundle } from '../../../../src/types/portal/copilot/copilot-bundle';
import {
  COPILOT_PAGES_FILE,
  GeneratedPortalContext
} from '../../../../src/types/portal/copilot/generated-portal-context';

const PAGES: BundlePage[] = [
  { path: '/', title: 'Welcome', description: 'Start here', markdown: '# Welcome' },
  { path: '/guides/caf%C3%A9', title: 'Café', description: null, markdown: '# Café' }
];

const BUNDLE = CopilotBundle.of(PAGES, null, '9.9.9', new Date('2026-10-14T12:00:00.000Z'));

describe('GeneratedPortalContext', () => {
  let root: string;
  let portal: GeneratedPortalContext;

  const write = (relative: string, contents: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
  const exists = (relative: string) => fs.existsSync(path.join(root, relative));

  /** Has `FileService` fail to read the files whose path ends with `suffix`. */
  const unreadable = (suffix: string) => {
    const getContents = FileService.prototype.getContents;
    return sinon.stub(FileService.prototype, 'getContents').callsFake(function (this: FileService, file) {
      return file.toString().endsWith(suffix)
        ? Promise.reject(new Error('EACCES: permission denied'))
        : getContents.call(this, file);
    });
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-portal-'));
    portal = new GeneratedPortalContext(new DirectoryPath(root));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('takePages', () => {
    it('reads the pages the build wrote for Ask AI, and removes them so they are not deployed', async () => {
      write(COPILOT_PAGES_FILE, JSON.stringify(PAGES));

      expect((await portal.takePages())._unsafeUnwrap()).to.deep.equal(PAGES);
      expect(exists(COPILOT_PAGES_FILE)).to.be.false;
    });

    it('is null for a build that wrote none, as one of a portal without Ask AI', async () => {
      expect((await portal.takePages())._unsafeUnwrap()).to.be.null;
    });

    it('reports pages it cannot make out, and still removes them', async () => {
      for (const contents of ['{', '{}', JSON.stringify([{ path: '/', title: 'Welcome' }])]) {
        write(COPILOT_PAGES_FILE, contents);

        expect((await portal.takePages()).isErr(), contents).to.be.true;
        expect(exists(COPILOT_PAGES_FILE), contents).to.be.false;
      }
    });

    it('reports pages it cannot read rather than throwing, and still removes them', async () => {
      write(COPILOT_PAGES_FILE, JSON.stringify(PAGES));
      unreadable('copilot-pages.json');

      expect((await portal.takePages())._unsafeUnwrapErr()).to.contain('EACCES: permission denied');
      expect(exists(COPILOT_PAGES_FILE)).to.be.false;
    });
  });

  describe('publish', () => {
    it('writes the bundle as plain JSON beside its build ID', async () => {
      expect((await portal.publish(BUNDLE)).isOk()).to.be.true;

      expect(read('__copilot/bundle.json')).to.equal(BUNDLE.toJson());
      expect(read('__copilot/build.json')).to.equal(BUNDLE.buildManifest());
      // As the service checks a deployed portal: the build ID is the hash of bundle.json as written.
      const written = fs.readFileSync(path.join(root, '__copilot', 'bundle.json'));
      expect(JSON.parse(read('__copilot/build.json')).buildId).to.equal(
        createHash('sha256').update(written).digest('hex')
      );
    });

    it('reports a portal it cannot write to rather than throwing', async () => {
      write('__copilot', 'a file where the directory goes');

      expect((await portal.publish(BUNDLE)).isErr()).to.be.true;
    });
  });

  describe('bundle', () => {
    it('reads back the bundle as it was published, byte for byte', async () => {
      await portal.publish(BUNDLE);

      const bundle = (await portal.bundle())._unsafeUnwrap()!;

      expect(bundle.toJson()).to.equal(BUNDLE.toJson());
      expect(bundle.buildManifest()).to.equal(BUNDLE.buildManifest());
    });

    it('is null for a portal without one', async () => {
      expect((await portal.bundle())._unsafeUnwrap()).to.be.null;
    });

    describe('of a portal saved as an archive', () => {
      /** Saves what is in `built` as `portal generate --zip` does: as the portal's only file. */
      const zipPortal = async (built: string) => {
        const archive = new FilePath(new DirectoryPath(root), new FileName('portal.zip'));
        (await new ZipService().archive(new DirectoryPath(path.join(root, built)), archive))._unsafeUnwrap();
        fs.rmSync(path.join(root, built), { recursive: true });
      };

      it('reads the bundle from inside the archive', async () => {
        await new GeneratedPortalContext(new DirectoryPath(path.join(root, 'built'))).publish(BUNDLE);
        await zipPortal('built');

        expect((await portal.bundle())._unsafeUnwrap()!.toJson()).to.equal(BUNDLE.toJson());
      });

      it('is null for an archive without one', async () => {
        write('built/index.html', '<html></html>');
        await zipPortal('built');

        expect((await portal.bundle())._unsafeUnwrap()).to.be.null;
      });

      it('reports an archive it cannot read', async () => {
        write('portal.zip', 'not a zip');

        expect((await portal.bundle()).isErr()).to.be.true;
      });
    });

    it('reports a bundle it cannot make out', async () => {
      write('__copilot/bundle.json', '{ "formatVersion": 2 }');

      expect((await portal.bundle()).isErr()).to.be.true;
    });

    it('reports a bundle it cannot read rather than throwing', async () => {
      await portal.publish(BUNDLE);
      unreadable('bundle.json');

      expect((await portal.bundle())._unsafeUnwrapErr()).to.contain('EACCES: permission denied');
    });
  });
});
