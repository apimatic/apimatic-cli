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
import { Language } from '../../../src/types/sdk/generate';
import { PortalSourceContext } from '../../../src/types/portal-source-context';
import { ProjectContext } from '../../../src/types/project-context';
import { completeArtifacts, stubPreparePortalProject } from './prepare-project-stubs';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal serve', shell: 'test' };
const FIXTURE = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default');
const FIXTURE_SOURCE = FIXTURE.join('src');
const PORT = 23513;
const SERVER_URL = new UrlPath('http://127.0.0.1:23513');

describe('PortalServeAction', () => {
  let root: string;
  let prompts: sinon.SinonStubbedInstance<PortalServePrompts>;
  let shared: ReturnType<typeof stubPreparePortalProject>;
  let authorize: sinon.SinonStub;
  let getServerPort: sinon.SinonStub;
  let openUrlInBrowser: sinon.SinonStub;
  let start: sinon.SinonStub;
  let stop: sinon.SinonStub;
  let watch: sinon.SinonStub;
  let watchTree: sinon.SinonStub;
  /** Stands in for the user pressing CTRL+C. */
  let interrupt: () => void;
  /** Stands in for the preview process dying, with what it printed on the way out. */
  let exit: (output: string) => void;

  const execute = (projectDirectory = FIXTURE, openInBrowser = false) =>
    new PortalServeAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(projectDirectory),
      PORT,
      openInBrowser
    );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-serve-'));

    shared = stubPreparePortalProject();

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

    authorize = sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(undefined));
    // Never a real watch: most tests serve the shared fixture, which nothing may edit.
    watch = sinon
      .stub(FileWatchService.prototype, 'watch')
      .returns(ok({ close: sinon.stub().resolves(), recheck: sinon.stub() }));
    watchTree = sinon
      .stub(FileWatchService.prototype, 'watchTree')
      .returns(ok({ close: sinon.stub().resolves(), recheck: sinon.stub() }));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stops before anything else when the installation cannot build a portal', async () => {
    shared.runtimeProblem.returns("The portal build dependency 'vite' is missing from this installation.");

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(
      shared.prompts.runtimeUnsupported.calledOnceWith(
        "The portal build dependency 'vite' is missing from this installation."
      )
    ).to.be.true;
    expect(authorize.called).to.be.false;
  });

  it('fails when the account may not build a portal, without starting the preview', async () => {
    authorize.resolves(err({ kind: 'notEntitled' as const }));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(shared.prompts.authorizationFailed.calledOnceWith({ kind: 'notEntitled' })).to.be.true;
    expect(getServerPort.called).to.be.false;
    expect(start.called).to.be.false;
  });

  it('reports a source directory it cannot serve, without asking for the artifacts', async () => {
    const empty = new DirectoryPath(root).join('empty');
    fs.mkdirSync(empty.join('src').toString(), { recursive: true });

    const result = await execute(empty);

    expect(result.isFailed()).to.be.true;
    expect(shared.prompts.sourceProblem.firstCall.args[0].kind).to.equal('missingConfig');
    expect(shared.artifacts.called).to.be.false;
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

    expect(prompts.portalServed.calledOnceWith(SERVER_URL, FIXTURE_SOURCE)).to.be.true;
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

  // The preview reloads the content itself; the CLI's part is saying what a build would refuse.
  describe('checking a save in the content directory', () => {
    let source: DirectoryPath;
    let watched: Promise<{ onChange: () => Promise<void>; onFailed: (reason: string) => void }>;
    let closeWatch: sinon.SinonStub;
    let recheck: sinon.SinonStub;
    let applyContent: sinon.SinonStub;

    const writeNavigation = (contents: string) =>
      fs.writeFileSync(path.join(source.toString(), 'content/guides/nav.json'), contents);

    /** Runs the preview until `body` is done with it, then stops it as CTRL+C would. */
    const whileServing = async (body: (save: (contents: string) => Promise<void>) => Promise<void>) => {
      const running = execute(new DirectoryPath(root));
      const { onChange } = await watched;
      try {
        await body(async (contents) => {
          writeNavigation(contents);
          await onChange();
        });
      } finally {
        interrupt();
        await running;
      }
    };

    beforeEach(() => {
      source = new DirectoryPath(root).join('src');
      fs.cpSync(FIXTURE_SOURCE.toString(), source.toString(), { recursive: true });

      closeWatch = sinon.stub().resolves();
      recheck = sinon.stub();
      applyContent = sinon.stub(PortalProjectService.prototype, 'applyContent').resolves(ok(undefined));
      watched = new Promise((resolve) => {
        watchTree.callsFake(
          (directory: DirectoryPath, onChange: () => Promise<void>, onFailed: (reason: string) => void) => {
            expect(directory.toString()).to.equal(source.join('content').toString());
            resolve({ onChange, onFailed });
            return ok({ close: closeWatch, recheck });
          }
        );
      });
    });

    // The preview itself turns every page into an HTTP 500 and says nothing.
    it('reports a nav.json saved half typed, as a build would', async () => {
      await whileServing(async (save) => {
        await save('{ "pages": ["intro", ');

        const [problems] = prompts.contentRejected.firstCall.args;
        expect(problems).to.deep.equal([
          { kind: 'invalidNavigation', errors: ['content/guides/nav.json is not valid JSON.'] }
        ]);
      });
    });

    it('reports an entry that matches nothing, which the preview drops without a word', async () => {
      await whileServing(async (save) => {
        await save(JSON.stringify({ pages: ['intro', 'does-not-exist'] }));

        const [[problem]] = prompts.contentRejected.firstCall.args;
        expect(problem.kind === 'invalidNavigation' && problem.errors[0]).to.contain(
          "'does-not-exist' is not a page or folder in this directory."
        );
      });
    });

    it('says once that the content is fixed, and nothing for a save a build accepts', async () => {
      await whileServing(async (save) => {
        await save(JSON.stringify({ pages: ['intro'] }));
        expect(prompts.contentRejected.called || prompts.contentAccepted.called).to.be.false;

        await save('{');
        await save(JSON.stringify({ pages: ['intro'] }));
        await save(JSON.stringify({ pages: ['intro', '...'] }));

        expect(prompts.contentRejected.calledOnce).to.be.true;
        expect(prompts.contentAccepted.calledOnce).to.be.true;
      });
    });

    it('brings the copy in line with a save a build accepts, as checked, and not with one it refuses', async () => {
      await whileServing(async (save) => {
        await save('{ "pages": [');
        expect(applyContent.called).to.be.false;

        const fixed = JSON.stringify({ title: 'Guides', pages: ['intro'] });
        await save(fixed);

        const [projectDirectory, contentDirectory, files] = applyContent.firstCall.args;
        const checked = files.find(
          ({ file }: { file: FilePath }) => file.relativeTo(source) === 'content/guides/nav.json'
        );
        expect(projectDirectory.toString()).to.equal(shared.prepare.firstCall.args[0].toString());
        expect(contentDirectory.toString()).to.equal(source.join('content').toString());
        expect(checked.contents).to.equal(fixed);
      });
    });

    it('says when a save it accepted could not be applied to the preview, and gives no notice for it', async () => {
      applyContent.resolves(err('EACCES: permission denied'));

      await whileServing(async (save) => {
        await save(JSON.stringify({ title: 'Overview', pages: ['intro'] }));

        expect(prompts.contentNotApplied.calledOnceWith('EACCES: permission denied')).to.be.true;
        expect(prompts.contentNotices.called).to.be.false;
      });
    });

    // The fixture's root nav.json names the Home tab 'Overview'.
    it('gives a notice on the save that brings it about, and not on the saves after it', async () => {
      await whileServing(async (save) => {
        await save(JSON.stringify({ title: 'Overview', pages: ['intro'] }));
        await save(JSON.stringify({ title: 'Overview', pages: ['intro', '...'] }));

        const names = prompts.contentNotices
          .getCalls()
          .map(({ args: [notices] }) => notices.sharedTabNames.map(({ name }) => name));
        expect(names).to.deep.equal([['Overview'], []]);
      });
    });

    it('checks the content again when an edit to apimatic.json adds or removes a generated tab', async () => {
      const configFile = path.join(source.toString(), 'apimatic.json');
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      let saveConfig: (edited: object) => Promise<void> = async () => undefined;
      watch.callsFake((_directory: DirectoryPath, _fileName: FileName, onChange: () => Promise<void>) => {
        saveConfig = async (edited) => {
          fs.writeFileSync(configFile, JSON.stringify(edited));
          await onChange();
        };
        return ok({ close: sinon.stub().resolves(), recheck: sinon.stub() });
      });
      sinon.stub(PortalProjectService.prototype, 'applyConfig').resolves(ok(true));
      writeNavigation(JSON.stringify({ title: 'Context Plugin', pages: ['intro'] }));

      await whileServing(async () => {
        recheck.resetHistory();
        await saveConfig({ ...config, portal: { ...config.portal, site: { ...config.portal.site, name: 'Renamed' } } });
        expect(recheck.called).to.be.false;

        // A hosted plugin, which the artifacts need not carry, so the preview shows its tab without a restart.
        await saveConfig({ ...config, portal: { ...config.portal, pluginUrl: 'https://plugins.acme.test/calc.zip' } });
        expect(recheck.calledOnce).to.be.true;
        // What the watch does on a recheck: check the content as though it had just been saved.
        await (await watched).onChange();

        const [notices] = prompts.contentNotices.lastCall.args;
        expect(notices.sharedTabNames.map(({ name }) => name)).to.deep.equal(['Context Plugin']);

        await saveConfig(config);
        expect(recheck.calledTwice).to.be.true;
      });
    });

    // An editor's swap file would only have the content checked again for nothing.
    it('leaves out of the watch what the build never reads', async () => {
      await whileServing(async () => {
        const isIgnored: (name: string) => boolean = watchTree.firstCall.args[3];

        expect(['.intro.md.swp', '.drafts', 'node_modules'].every(isIgnored)).to.be.true;
        expect(isIgnored('intro.md')).to.be.false;
      });
    });

    // The content is checked before the preview starts, which can take a minute.
    it('checks the content again once it is watched, and stops watching when the preview stops', async () => {
      await whileServing(async () => {
        expect(recheck.calledOnce).to.be.true;
      });

      expect(closeWatch.called).to.be.true;
      expect(closeWatch.calledBefore(prompts.stopping)).to.be.true;
    });

    it('says when the content cannot be watched, and serves regardless', async () => {
      watchTree.returns(err('EMFILE: too many open files'));
      interrupt();

      const result = await execute(new DirectoryPath(root));

      expect(prompts.contentNotWatched.calledOnceWith('EMFILE: too many open files')).to.be.true;
      expect(result.isCancelled()).to.be.true;
    });

    it('tells the user when the content stops being watched', async () => {
      await whileServing(async () => {
        (await watched).onFailed('EPERM: operation not permitted');

        expect(prompts.contentWatchFailed.calledOnceWith('EPERM: operation not permitted')).to.be.true;
      });
    });

    it('says when a save could not be checked, rather than dropping it', async () => {
      sinon.stub(PortalSourceContext.prototype, 'resolveContent').rejects(new Error('EIO: i/o error'));

      await whileServing(async (save) => {
        await save(JSON.stringify({ pages: ['intro'] }));

        expect(prompts.contentNotChecked.calledOnceWith('EIO: i/o error')).to.be.true;
      });
    });

    // A check still running would otherwise report after the terminal says the preview stopped.
    it('stops watching before saying that the preview stopped on its own', async () => {
      const running = execute(new DirectoryPath(root));
      await watched;
      exit('Error: out of memory');

      expect((await running).isFailed()).to.be.true;
      expect(closeWatch.calledBefore(prompts.previewStopped)).to.be.true;
    });

    it('watches nothing when there is no content directory', async () => {
      fs.rmSync(path.join(source.toString(), 'content'), { recursive: true });
      interrupt();

      await execute(new DirectoryPath(root));

      expect(watchTree.called).to.be.false;
    });
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

    const originalConfig = () =>
      JSON.parse(fs.readFileSync(path.join(FIXTURE_SOURCE.toString(), 'apimatic.json'), 'utf8'));
    const readProject = (relative: string) => fs.readFileSync(path.join(projectDirectory.toString(), relative), 'utf8');
    const writeConfig = (config: object) =>
      fs.writeFileSync(path.join(source.toString(), 'apimatic.json'), JSON.stringify(config));

    /** Runs the preview until `body` is done with it, then stops it as CTRL+C would. */
    const whileServing = async (body: () => Promise<void>) => {
      const running = execute(new DirectoryPath(root));
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
      fs.cpSync(FIXTURE_SOURCE.toString(), source.toString(), { recursive: true });

      // `prepare` is stubbed above; this one writes the files an edit can change, as a real one
      // would, so the test can see what an edit changes.
      (PortalProjectService.prototype.prepare as sinon.SinonStub).callsFake(
        async (directory: DirectoryPath, portal: PortalSource) => {
          projectDirectory = directory;
          fs.mkdirSync(path.join(directory.toString(), 'src/styles'), { recursive: true });
          (await new PortalProjectService().applyConfig(directory, portal))._unsafeUnwrap();
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

    // `sdk publish` and `plugin generate` rewrite the whole file to change their own block, and a
    // key kept by hand beside a language is read by nothing the preview shows.
    it('applies nothing, and says nothing, for a change outside what the preview shows', async () => {
      await whileServing(async () => {
        const before = [readProject('portal.identity.json'), readProject('generated/sdks/typescript.mdx')];

        await save({ ...originalConfig(), languages: { typescript: { notes: 'kept by hand' } } });

        expect([readProject('portal.identity.json'), readProject('generated/sdks/typescript.mdx')]).to.deep.equal(
          before
        );
        expect(prompts.configApplied.called).to.be.false;
        expect(prompts.configRejected.called).to.be.false;
      });
    });

    // What `sdk publish` writes: where the SDK went, which its card and page show.
    it('shows a release recorded while it runs', async () => {
      await whileServing(async () => {
        const config = originalConfig();
        config.languages.typescript = {
          publishing: {
            source: { repositoryUrl: 'https://github.com/acme/calc-ts' },
            package: { version: '1.0.0' },
            packageConfiguration: { name: 'calc' }
          }
        };

        await save(config);

        expect(readProject('generated/sdks/typescript.mdx')).to.contain(
          'packageUrl="https://www.npmjs.com/package/calc"'
        );
        expect(readProject('generated/sdks/index.mdx')).to.contain('version="1.0.0"');
        expect(prompts.configApplied.calledOnce).to.be.true;
      });
    });

    describe('against the artifacts the preview started with', () => {
      const projectHas = (relative: string) => fs.existsSync(path.join(projectDirectory.toString(), relative));

      // What a run for the fixture delivers: its one language, and no plugin.
      beforeEach(() => shared.artifacts.resolves(ok(completeArtifacts(['typescript'], { plugin: false }))));

      it('refuses a language added, which needs its SDK fetched, and hears it accepted once removed again', async () => {
        await whileServing(async () => {
          const config = originalConfig();
          config.languages.python = {};

          await save(config);

          expect(
            prompts.editNeedsRestart.calledOnceWith({
              sdks: [Language.PYTHON],
              sdkDocs: [Language.PYTHON],
              plugin: false
            })
          ).to.be.true;
          expect(projectHas('generated/sdks/python.mdx')).to.be.false;
          expect(prompts.configApplied.called).to.be.false;

          await save(originalConfig());

          expect(prompts.configApplied.calledOnce).to.be.true;
        });
      });

      it('refuses a plugin block added, whose plugin the preview has no copy of', async () => {
        await whileServing(async () => {
          await save({ ...originalConfig(), plugin: { pluginId: 'calc', pluginVersion: '0.1.0' } });

          expect(prompts.editNeedsRestart.calledOnceWith({ sdks: [], sdkDocs: [], plugin: true })).to.be.true;
          expect(projectHas('generated/context-plugin/index.mdx')).to.be.false;
        });
      });

      it('applies a plugin hosted elsewhere, which needs nothing fetched', async () => {
        await whileServing(async () => {
          const config = originalConfig();
          config.portal.pluginUrl = 'https://plugins.acme.test/calc.zip';

          await save(config);

          expect(readProject('generated/context-plugin/index.mdx')).to.contain('Context Plugin');
          expect(prompts.editNeedsRestart.called).to.be.false;
          expect(prompts.configApplied.calledOnce).to.be.true;
        });
      });

      it('applies a language removed, deleting its page', async () => {
        shared.artifacts.resolves(ok(completeArtifacts(['typescript', 'python'], { plugin: false })));
        writeConfig({ ...originalConfig(), languages: { typescript: {}, python: {} } });

        await whileServing(async () => {
          expect(projectHas('generated/sdks/python.mdx')).to.be.true;

          await save(originalConfig());

          expect(projectHas('generated/sdks/python.mdx')).to.be.false;
          expect(prompts.configApplied.calledOnce).to.be.true;
        });
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
        const resolveSettings = sinon
          .stub(PortalSourceContext.prototype, 'resolveSettings')
          .rejects(new Error('EBUSY: resource busy or locked'));
        const config = originalConfig();
        config.portal.site.name = 'Renamed API';

        await save(config);

        expect(prompts.configNotApplied.calledOnceWith('EBUSY: resource busy or locked')).to.be.true;
        resolveSettings.restore();
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

      const result = await execute(new DirectoryPath(root));

      expect(prompts.configNotWatched.calledOnceWith('EMFILE: too many open files')).to.be.true;
      expect(result.isCancelled()).to.be.true;
    });
  });
});
