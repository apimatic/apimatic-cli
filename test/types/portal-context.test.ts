import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';
import { FileService } from '../../src/infrastructure/file-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { PortalContext } from '../../src/types/portal-context';

describe('PortalContext', () => {
  let root: string;
  let portal: DirectoryPath;
  let built: DirectoryPath;

  const write = (directory: DirectoryPath, relative: string, contents = '') => {
    const target = path.join(directory.toString(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  const entries = (directory: DirectoryPath) => fs.readdirSync(directory.toString()).sort();

  const staging = () => portal.join('.apimatic-staging');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-context-'));
    portal = new DirectoryPath(root).join('portal');
    built = new DirectoryPath(root).join('site');
    write(built, 'index.html', '<html>home</html>');
    write(built, '_shell.html', '<html>shell</html>');
    write(built, 'docs/intro.html', '<html>intro</html>');
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('exists', () => {
    it('is false for a portal directory with nothing in it', async () => {
      fs.mkdirSync(portal.toString());

      expect(await new PortalContext(portal).exists()).to.be.false;
    });

    it('is true once anything is there to overwrite', async () => {
      write(portal, 'old.html');

      expect(await new PortalContext(portal).exists()).to.be.true;
    });

    // Hidden, but it may hold the only complete copy of the site a failed save left behind.
    it('is true when all that is there is a staging directory a save could not finish', async () => {
      write(staging(), 'index.html');

      expect(await new PortalContext(portal).exists()).to.be.true;
    });
  });

  describe('save', () => {
    it('replaces the previous portal with the site, and a not-found page copied from its shell', async () => {
      write(portal, 'old.html');

      const saved = await new PortalContext(portal).save(built, false);

      expect(saved.isOk()).to.be.true;
      expect(entries(portal)).to.deep.equal(['404.html', '_shell.html', 'docs', 'index.html']);
      expect(fs.readFileSync(path.join(portal.toString(), '404.html'), 'utf8')).to.equal('<html>shell</html>');
      expect(fs.existsSync(staging().toString())).to.be.false;
    });

    it('leaves the archive alone in the portal when saving as a zip', async () => {
      write(portal, 'old.html');

      const saved = await new PortalContext(portal).save(built, true);

      expect(saved.isOk()).to.be.true;
      expect(entries(portal)).to.deep.equal(['portal.zip']);
    });

    it('adds no not-found page to a site without a shell', async () => {
      fs.rmSync(path.join(built.toString(), '_shell.html'));

      await new PortalContext(portal).save(built, false);

      expect(entries(portal)).to.deep.equal(['docs', 'index.html']);
    });

    // Nothing of the previous portal is touched until the new one is staged in full.
    it('keeps the previous portal as it was when the site cannot be staged', async () => {
      write(portal, 'old.html', 'previous');

      const saved = await new PortalContext(portal).save(new DirectoryPath(root).join('missing'), false);

      const problem = saved._unsafeUnwrapErr();
      expect(problem.kind).to.equal('stagingFailed');
      expect(problem.reason).to.not.be.empty;
      expect(fs.readFileSync(path.join(portal.toString(), 'old.html'), 'utf8')).to.equal('previous');
      expect(fs.existsSync(staging().toString())).to.be.false;
    });

    // The previous portal is already gone by then, so the staged copy is the only one left.
    it('keeps the staged site, and says where, when the swap fails part-way', async () => {
      write(portal, 'old.html');
      sinon.stub(FileService.prototype, 'moveDirectoryContents').rejects(new Error('EBUSY: resource busy or locked'));

      const saved = await new PortalContext(portal).save(built, false);

      const problem = saved._unsafeUnwrapErr();
      expect(problem.kind).to.equal('replaceFailed');
      if (problem.kind !== 'replaceFailed') return;
      expect(problem.reason).to.contain('EBUSY');
      expect(problem.stagedAt.isEqual(staging())).to.be.true;
      expect(entries(staging())).to.deep.equal(['404.html', '_shell.html', 'docs', 'index.html']);
    });
  });

  describe('saveBuildLog', () => {
    it('writes the log beside the portal and says where', async () => {
      const logPath = await new PortalContext(portal).saveBuildLog('vite: build failed');

      expect(logPath?.toString()).to.equal(path.join(portal.toString(), 'apimatic-debug', 'build.log'));
      expect(fs.readFileSync(logPath!.toString(), 'utf8')).to.equal('vite: build failed');
    });

    it('is null when the log cannot be written', async () => {
      sinon.stub(FileService.prototype, 'writeContents').rejects(new Error('EACCES: permission denied'));

      expect(await new PortalContext(portal).saveBuildLog('vite: build failed')).to.be.null;
    });
  });
});
