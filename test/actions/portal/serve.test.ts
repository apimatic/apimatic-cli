import fs from 'fs';
import os from 'os';
import path from 'path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { PortalServeAction } from '../../../src/actions/portal/serve';
import { PortalServePrompts } from '../../../src/prompts/portal/serve';
import { PortalAuthorizationService } from '../../../src/infrastructure/services/portal-authorization-service';
import { PortalDevServerService } from '../../../src/infrastructure/portal-dev-server-service';
import { PortalProjectService } from '../../../src/infrastructure/portal-project-service';
import { FileWatchService } from '../../../src/infrastructure/file-watch-service';
import { NetworkService } from '../../../src/infrastructure/network-service';
import { LauncherService } from '../../../src/infrastructure/launcher-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { UrlPath } from '../../../src/types/file/urlPath';
import { CommandMetadata } from '../../../src/types/common/command-metadata';
import { PortalSource } from '../../../src/types/portal/portal-source';
import { PortalSourceContext } from '../../../src/types/portal-source-context';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal serve', shell: 'test' };
const FIXTURE = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default');
const PORT = 23513;
const SERVER_URL = new UrlPath('http://127.0.0.1:23513');

describe('PortalServeAction', () => {
  let root: string;
  let prompts: sinon.SinonStubbedInstance<PortalServePrompts>;
  let runtimeProblem: sinon.SinonStub;
  let authorize: sinon.SinonStub;
  let getServerPort: sinon.SinonStub;
  let openUrlInBrowser: sinon.SinonStub;
  let start: sinon.SinonStub;
  let stop: sinon.SinonStub;
  let watch: sinon.SinonStub;
  /** Stands in for the user pressing CTRL+C. */
  let interrupt: () => void;
  /** Stands in for the preview process dying, with what it printed on the way out. */
  let exit: (output: string) => void;

  const execute = (source = FIXTURE, openInBrowser = false) =>
    new PortalServeAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(source, PORT, openInBrowser);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-serve-'));

    prompts = sinon.stub(PortalServePrompts.prototype);
    // The spinner would render to stdout; pass the underlying promise straight through.
    prompts.startPreview.callsFake((fn) => fn);
    prompts.blockExecution.returns(
      new Promise<void>((resolve) => {
        interrupt = resolve;
      })
    );

    const exited = new Promise<string>((resolve) => {
      exit = resolve;
    });
    stop = sinon.stub().resolves();
    start = sinon.stub(PortalDevServerService.prototype, 'start').resolves(ok({ url: SERVER_URL, exited, stop }));
    getServerPort = sinon.stub(NetworkService.prototype, 'getServerPort').resolves(PORT);
    openUrlInBrowser = sinon.stub(LauncherService.prototype, 'openUrlInBrowser').resolves();

    runtimeProblem = sinon.stub(PortalProjectService.prototype, 'runtimeProblem').returns(null);
    sinon
      .stub(PortalProjectService.prototype, 'prepare')
      .callsFake(async (projectDirectory) =>
        ok({ projectDirectory, viteBinary: new FilePath(projectDirectory, new FileName('vite.js')) })
      );
    authorize = sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(undefined));
    // Never a real watch: most tests serve the shared fixture, which nothing may edit.
    watch = sinon
      .stub(FileWatchService.prototype, 'watch')
      .returns(ok({ close: sinon.stub().resolves(), recheck: sinon.stub() }));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stops before anything else when the installation cannot build a portal', async () => {
    runtimeProblem.returns("The portal build dependency 'vite' is missing from this installation.");

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(
      prompts.runtimeUnsupported.calledOnceWith("The portal build dependency 'vite' is missing from this installation.")
    ).to.be.true;
    expect(authorize.called).to.be.false;
  });

  it('fails when the account may not build a portal, without starting the preview', async () => {
    authorize.resolves(err({ kind: 'notEntitled' as const }));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.authorizationFailed.calledOnceWith({ kind: 'notEntitled' })).to.be.true;
    expect(start.called).to.be.false;
  });

  it('reports a source directory it cannot serve', async () => {
    const empty = new DirectoryPath(root).join('empty');
    fs.mkdirSync(empty.toString());

    const result = await execute(empty);

    expect(result.isFailed()).to.be.true;
    expect(prompts.sourceProblem.firstCall.args[0].kind).to.equal('missingConfig');
    expect(start.called).to.be.false;
  });

  it('serves on a fallback port, and says so, when the requested one is taken', async () => {
    getServerPort.resolves(3000);
    interrupt();

    await execute();

    expect(prompts.usingFallbackPort.calledOnceWith(PORT, 3000)).to.be.true;
    expect(start.firstCall.args[1]).to.equal(3000);
  });

  it('says nothing about the port when the requested one is free', async () => {
    interrupt();

    await execute();

    expect(prompts.usingFallbackPort.called).to.be.false;
    expect(start.firstCall.args[1]).to.equal(PORT);
  });

  it('fails when the preview does not start, showing what it printed', async () => {
    start.resolves(err({ message: 'The portal preview did not start in time.', log: 'EADDRINUSE' }));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.startFailed.calledOnceWith('EADDRINUSE')).to.be.true;
    expect(prompts.portalServed.called).to.be.false;
  });

  it('announces the address once the preview is up', async () => {
    interrupt();

    await execute();

    expect(prompts.portalServed.calledOnceWith(SERVER_URL, FIXTURE)).to.be.true;
  });

  it('opens the browser only when asked', async () => {
    interrupt();

    await execute(FIXTURE, false);
    expect(openUrlInBrowser.called).to.be.false;

    await execute(FIXTURE, true);
    expect(openUrlInBrowser.calledOnceWith(SERVER_URL)).to.be.true;
  });

  it('stops the preview when the user interrupts', async () => {
    interrupt();

    const result = await execute();

    expect(result.isCancelled()).to.be.true;
    expect(result.getMessage()).to.equal('Stopped');
    expect(prompts.stopping.calledOnce).to.be.true;
    expect(stop.calledOnce).to.be.true;
  });

  it('reports a preview that stops on its own rather than advertising it', async () => {
    exit('Error: the specification vanished');

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.previewStopped.calledOnceWith('Error: the specification vanished')).to.be.true;
    expect(stop.called).to.be.false;
  });

  /**
   * Edits to `apimatic.json` while the preview runs. The watcher is stood in for, so a save is
   * a call the test makes; everything behind it -- reading the file, the rules, writing the
   * preview's files -- is the real thing, on a copy of the fixture.
   */
  describe('re-applying apimatic.json', () => {
    let source: DirectoryPath;
    let save: (config: object) => Promise<void>;
    let watched: Promise<{ onChange: () => Promise<void>; onFailed: (reason: string) => void }>;
    let closeWatch: sinon.SinonStub;
    let recheck: sinon.SinonStub;
    let projectDirectory: DirectoryPath;

    const originalConfig = () => JSON.parse(fs.readFileSync(path.join(FIXTURE.toString(), 'apimatic.json'), 'utf8'));
    const readProject = (relative: string) => fs.readFileSync(path.join(projectDirectory.toString(), relative), 'utf8');
    const writeConfig = (config: object) =>
      fs.writeFileSync(path.join(source.toString(), 'apimatic.json'), JSON.stringify(config));

    /** Runs the preview until `body` is done with it, then stops it as CTRL+C would. */
    const whileServing = async (body: () => Promise<void>) => {
      const running = execute(source);
      const { onChange } = await watched;
      save = async (config: object) => {
        writeConfig(config);
        await onChange();
      };
      try {
        await body();
      } finally {
        interrupt();
        await running;
      }
    };

    beforeEach(() => {
      source = new DirectoryPath(root).join('src');
      fs.cpSync(FIXTURE.toString(), source.toString(), { recursive: true });

      // `prepare` is stubbed above; this one writes the two files a real one would, so the
      // test can see what an edit changes.
      (PortalProjectService.prototype.prepare as sinon.SinonStub).callsFake(
        async (directory: DirectoryPath, portal: PortalSource) => {
          projectDirectory = directory;
          fs.mkdirSync(path.join(directory.toString(), 'src/styles'), { recursive: true });
          (await new PortalProjectService().applyConfig(directory, portal.config))._unsafeUnwrap();
          return ok({ projectDirectory: directory, viteBinary: new FilePath(directory, new FileName('vite.js')) });
        }
      );

      closeWatch = sinon.stub().resolves();
      recheck = sinon.stub();
      watched = new Promise((resolve) => {
        watch.callsFake(
          (
            directory: DirectoryPath,
            fileName: FileName,
            onChange: () => Promise<void>,
            onFailed: (reason: string) => void
          ) => {
            expect(directory.toString()).to.equal(source.toString());
            expect(fileName.toString()).to.equal('apimatic.json');
            resolve({ onChange, onFailed });
            return ok({ close: closeWatch, recheck });
          }
        );
      });
    });

    it('stops watching when the preview stops, before saying it stops', async () => {
      await whileServing(async () => {
        expect(closeWatch.called).to.be.false;
      });

      expect(closeWatch.called).to.be.true;
      expect(closeWatch.calledBefore(prompts.stopping)).to.be.true;
    });

    // The file is read before the preview starts, which can take a minute.
    it('reads the file again once it is watched, for a save made while the preview started', async () => {
      const exited = new Promise<string>(() => undefined);
      start.callsFake(async () => {
        const config = originalConfig();
        config.portal.brand.colors = { primary: '#1d4ed8' };
        writeConfig(config);
        return ok({ url: SERVER_URL, exited, stop });
      });

      await whileServing(async () => {
        expect(recheck.calledOnce).to.be.true;
        // What the watch does on a recheck: handle the file as though it had just been saved.
        await (await watched).onChange();

        expect(readProject('src/styles/theme.css')).to.contain('--color-fd-primary: #1d4ed8;');
        expect(prompts.configApplied.calledOnce).to.be.true;
      });
    });

    it('rewrites both of the preview’s files for a brand change, and says so', async () => {
      await whileServing(async () => {
        const config = originalConfig();
        config.portal.brand.colors = { primary: '#1d4ed8' };
        config.portal.site.name = 'Renamed API';

        await save(config);

        expect(readProject('src/styles/theme.css')).to.contain('--color-fd-primary: #1d4ed8;');
        expect(JSON.parse(readProject('portal.identity.json')).name).to.equal('Renamed API');
        expect(prompts.configApplied.calledOnce).to.be.true;
      });
    });

    // `sdk publish` and `plugin generate` rewrite the whole file to change their own block.
    it('applies nothing, and says nothing, for a change outside what the preview shows', async () => {
      await whileServing(async () => {
        const before = readProject('portal.identity.json');
        const config = originalConfig();
        config.plugin = { pluginId: 'calc', pluginVersion: '0.1.0' };
        config.languages.python = {};

        await save(config);

        expect(readProject('portal.identity.json')).to.equal(before);
        expect(prompts.configApplied.called).to.be.false;
        expect(prompts.configRejected.called).to.be.false;
      });
    });

    it('refuses a favicon edited to a missing file as a build would, keeping the last good files', async () => {
      await whileServing(async () => {
        const before = [readProject('portal.identity.json'), readProject('src/styles/theme.css')];
        const config = originalConfig();
        config.portal.brand.favicon = 'static/missing.ico';

        await save(config);

        const [problem, directory] = prompts.configRejected.firstCall.args;
        expect(problem.kind).to.equal('missingStaticFiles');
        const files = problem.kind === 'missingStaticFiles' ? problem.files : [];
        expect(files.map(({ setting, file, foundAs }) => [setting, file.relativeTo(source), foundAs])).to.deep.equal([
          ['portal.brand.favicon', 'static/missing.ico', null]
        ]);
        expect(directory.toString()).to.equal(source.toString());
        expect([readProject('portal.identity.json'), readProject('src/styles/theme.css')]).to.deep.equal(before);
      });
    });

    it('reports an invalid edit, keeps the last good files, and hears it accepted once it is fixed back', async () => {
      await whileServing(async () => {
        const before = [readProject('portal.identity.json'), readProject('src/styles/theme.css')];
        const broken = originalConfig();
        broken.portal.brand.colorMode = 'sepia';
        broken.portal.site.name = 'Renamed API';

        await save(broken);
        expect(prompts.configRejected.firstCall.args[0].kind).to.equal('invalidConfig');
        expect(prompts.configApplied.called).to.be.false;
        expect([readProject('portal.identity.json'), readProject('src/styles/theme.css')]).to.deep.equal(before);

        await save(originalConfig());
        expect(prompts.configApplied.calledOnce).to.be.true;
      });
    });

    it('reports a file removed while the preview runs', async () => {
      await whileServing(async () => {
        fs.rmSync(path.join(source.toString(), 'apimatic.json'));
        await (await watched).onChange();

        expect(prompts.configRejected.firstCall.args[0]).to.deep.equal({ kind: 'missingConfig' });
      });
    });

    // Vite reads its public directory once, and one missing at startup is served as none.
    it('says once that the files of a static directory made while it runs need a restart', async () => {
      fs.rmSync(path.join(source.toString(), 'static'), { recursive: true });
      const config = originalConfig();
      delete config.portal.brand;
      writeConfig(config);

      await whileServing(async () => {
        fs.mkdirSync(path.join(source.toString(), 'static'));
        fs.writeFileSync(path.join(source.toString(), 'static', 'logo.png'), 'x');
        const branded = { ...config, portal: { ...config.portal, brand: { logo: 'static/logo.png' } } };

        await save(branded);
        await save({ ...branded, portal: { ...branded.portal, ai: { pageActions: false } } });

        expect(prompts.staticDirectoryNotServed.calledOnce).to.be.true;
        expect(prompts.staticDirectoryNotServed.firstCall.args[0].toString()).to.equal(source.toString());
        expect(JSON.parse(readProject('portal.identity.json')).logo).to.deep.equal({
          light: '/logo.png',
          dark: '/logo.png'
        });
      });
    });

    it('says nothing of the static directory when it was there at startup', async () => {
      await whileServing(async () => {
        // The logo is in the static directory, which the fixture has.
        const config = originalConfig();
        config.portal.site.name = 'Renamed API';

        await save(config);

        expect(prompts.staticDirectoryNotServed.called).to.be.false;
        expect(prompts.configApplied.calledOnce).to.be.true;
      });
    });

    it('reports a change it could not write to the preview', async () => {
      await whileServing(async () => {
        sinon.stub(PortalProjectService.prototype, 'applyConfig').resolves(err('EACCES: permission denied'));
        const config = originalConfig();
        config.portal.site.name = 'Renamed API';

        await save(config);

        expect(prompts.configNotApplied.calledOnceWith('EACCES: permission denied')).to.be.true;
        expect(prompts.configApplied.called).to.be.false;
      });
    });

    it('reports a fault it did not expect while re-reading the file, and keeps watching', async () => {
      await whileServing(async () => {
        const resolveConfig = sinon
          .stub(PortalSourceContext.prototype, 'resolveConfig')
          .rejects(new Error('EBUSY: resource busy or locked'));
        const config = originalConfig();
        config.portal.site.name = 'Renamed API';

        await save(config);

        expect(prompts.configNotApplied.calledOnceWith('EBUSY: resource busy or locked')).to.be.true;
        resolveConfig.restore();
        await save(config);
        expect(prompts.configApplied.calledOnce).to.be.true;
      });
    });

    it('tells the user when the file stops being watched', async () => {
      await whileServing(async () => {
        (await watched).onFailed('EPERM: operation not permitted');

        expect(prompts.configWatchFailed.calledOnceWith('EPERM: operation not permitted')).to.be.true;
      });
    });

    it('tells the user when the file cannot be watched, and serves regardless', async () => {
      watch.returns(err('EMFILE: too many open files'));
      interrupt();

      const result = await execute(source);

      expect(prompts.configNotWatched.calledOnceWith('EMFILE: too many open files')).to.be.true;
      expect(result.isCancelled()).to.be.true;
    });
  });
});
