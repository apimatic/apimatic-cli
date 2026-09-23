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
import { NetworkService } from '../../../src/infrastructure/network-service';
import { LauncherService } from '../../../src/infrastructure/launcher-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { UrlPath } from '../../../src/types/file/urlPath';
import { CommandMetadata } from '../../../src/types/common/command-metadata';

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
  /** Stands in for the user pressing CTRL+C. */
  let interrupt: () => void;
  /** Stands in for the preview process dying, with what it printed on the way out. */
  let exit: (output: string) => void;

  const execute = (source = FIXTURE, openInBrowser = false, onAfterServe?: () => void) =>
    new PortalServeAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      source,
      PORT,
      openInBrowser,
      onAfterServe
    );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-serve-'));

    prompts = sinon.stub(PortalServePrompts.prototype);
    // The spinner would render to stdout; pass the underlying promise straight through.
    prompts.startPreview.callsFake((fn) => fn);
    prompts.generateCodeSamples.callsFake((fn) => fn);
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

  it("runs the caller's hook once the preview is up", async () => {
    interrupt();
    const hook = sinon.spy();

    await execute(FIXTURE, false, hook);

    expect(hook.calledOnce).to.be.true;
    expect(hook.calledAfter(prompts.portalServed)).to.be.true;
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
});
