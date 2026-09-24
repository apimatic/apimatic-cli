import fs from 'fs';
import os from 'os';
import path from 'path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { GenerateAction } from '../../../src/actions/portal/generate';
import { PortalGeneratePrompts } from '../../../src/prompts/portal/generate';
import { PortalAuthorizationService } from '../../../src/infrastructure/services/portal-authorization-service';
import { PortalBuildService } from '../../../src/infrastructure/portal-build-service';
import { PortalProjectService } from '../../../src/infrastructure/portal-project-service';
import { PortalArtifactsService } from '../../../src/infrastructure/services/portal-artifacts-service';
import { ServiceError } from '../../../src/infrastructure/service-error';
import { FileService } from '../../../src/infrastructure/file-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { CommandMetadata } from '../../../src/types/common/command-metadata';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal generate', shell: 'test' };
const FIXTURE = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default');
const CODE_SAMPLES_FIXTURE = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/code-samples');

describe('GenerateAction', () => {
  let root: string;
  let portalDirectory: DirectoryPath;
  let prompts: sinon.SinonStubbedInstance<PortalGeneratePrompts>;
  let runtimeProblem: sinon.SinonStub;
  let authorize: sinon.SinonStub;
  let build: sinon.SinonStub;
  let prepare: sinon.SinonStub;
  let addCodeSamples: sinon.SinonStub;

  const execute = (source = FIXTURE, force = false, zip = false) =>
    new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      source,
      portalDirectory,
      force,
      zip
    );

  const inPortal = (relative: string) => fs.existsSync(path.join(portalDirectory.toString(), relative));

  const writeOldPortal = () => {
    fs.mkdirSync(portalDirectory.toString(), { recursive: true });
    fs.writeFileSync(path.join(portalDirectory.toString(), 'old.html'), '');
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-generate-'));
    portalDirectory = new DirectoryPath(root).join('portal');

    // What a successful build hands back: a directory holding the finished site.
    const builtSite = new DirectoryPath(root).join('site');
    fs.mkdirSync(builtSite.toString(), { recursive: true });
    fs.writeFileSync(path.join(builtSite.toString(), 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(builtSite.toString(), '_shell.html'), '<html></html>');

    prompts = sinon.stub(PortalGeneratePrompts.prototype);
    // The spinner would render to stdout; pass the underlying promise straight through.
    prompts.buildPortal.callsFake((fn) => fn);
    prompts.generateCodeSamples.callsFake((fn) => fn);
    prompts.savePortal.callsFake((fn) => fn);
    prompts.overwritePortal.resolves(true);

    runtimeProblem = sinon.stub(PortalProjectService.prototype, 'runtimeProblem').returns(null);
    prepare = sinon
      .stub(PortalProjectService.prototype, 'prepare')
      .callsFake(async (projectDirectory) =>
        ok({ projectDirectory, viteBinary: new FilePath(projectDirectory, new FileName('vite.js')) })
      );
    addCodeSamples = sinon
      .stub(PortalProjectService.prototype, 'addCodeSamples')
      .callsFake(async (_projectDirectory, source) => ({ source, unsampledSpecs: [] }));
    authorize = sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(undefined));
    build = sinon.stub(PortalBuildService.prototype, 'build').resolves(ok({ output: builtSite, pageCount: 3 }));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails without building when the code samples cannot be generated', async () => {
    sinon.stub(PortalArtifactsService.prototype, 'generate').resolves(err(ServiceError.ServerError));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(build.called).to.be.false;
    expect(fs.existsSync(portalDirectory.toString())).to.be.false;
  });

  it('builds from a copy of each spec carrying its code samples', async () => {
    addCodeSamples.restore();
    let built = '';
    prepare.callsFake(async (projectDirectory, source) => {
      built = fs.readFileSync(source.specs[0].file.toString(), 'utf8');
      return ok({ projectDirectory, viteBinary: new FilePath(projectDirectory, new FileName('vite.js')) });
    });
    process.env.APIMATIC_CODE_SAMPLES_PATH = 'test/resources/code-samples.json';

    const result = await execute(CODE_SAMPLES_FIXTURE).finally(() => delete process.env.APIMATIC_CODE_SAMPLES_PATH);

    expect(result.isSuccess()).to.be.true;
    expect(prepare.firstCall.args[1].specs[0].file.toString()).to.not.contain(CODE_SAMPLES_FIXTURE.toString());
    expect(built).to.contain('x-apimatic-codeSamples');
    expect(prompts.unplacedSamples.calledOnceWith([])).to.be.true;
  });

  it('fails when the source and destination are the same directory', async () => {
    const action = new GenerateAction(new DirectoryPath(root), COMMAND_METADATA);

    const result = await action.execute(FIXTURE, FIXTURE, false, false);

    expect(result.isFailed()).to.be.true;
    expect(prompts.directoryCannotBeSame.calledOnce).to.be.true;
    expect(authorize.called).to.be.false;
  });

  it('refuses a destination that contains the source, which it would empty', async () => {
    const source = portalDirectory.join('src');

    const result = await execute(source);

    expect(result.isFailed()).to.be.true;
    expect(prompts.destinationContainsSource.calledOnceWith(source, portalDirectory)).to.be.true;
    expect(build.called).to.be.false;
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

  it('fails when the account may not build a portal, without starting a build', async () => {
    authorize.resolves(err({ kind: 'notEntitled' as const }));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.authorizationFailed.calledOnceWith({ kind: 'notEntitled' })).to.be.true;
    expect(build.called).to.be.false;
  });

  it('reports a source directory it cannot build from', async () => {
    const empty = new DirectoryPath(root).join('empty');
    fs.mkdirSync(empty.toString());

    const result = await execute(empty);

    expect(result.isFailed()).to.be.true;
    expect(prompts.sourceProblem.calledOnce).to.be.true;
    expect(prompts.sourceProblem.firstCall.args[0].kind).to.equal('missingConfig');
    expect(build.called).to.be.false;
  });

  it('asks before overwriting a destination that is not empty, and stops when declined', async () => {
    writeOldPortal();
    prompts.overwritePortal.resolves(false);

    const result = await execute();

    expect(result.isCancelled()).to.be.true;
    expect(prompts.overwritePortal.calledOnceWith(portalDirectory)).to.be.true;
    expect(build.called).to.be.false;
    expect(inPortal('old.html')).to.be.true;
  });

  it('counts a staging folder left by an unfinished save as a portal to overwrite', async () => {
    fs.mkdirSync(path.join(portalDirectory.toString(), '.apimatic-staging'), { recursive: true });
    fs.writeFileSync(path.join(portalDirectory.toString(), '.apimatic-staging', 'index.html'), '');
    prompts.overwritePortal.resolves(false);

    const result = await execute();

    expect(result.isCancelled()).to.be.true;
    expect(prompts.overwritePortal.calledOnce).to.be.true;
    expect(inPortal('.apimatic-staging/index.html')).to.be.true;
  });

  it('does not ask when forced', async () => {
    writeOldPortal();

    const result = await execute(FIXTURE, true);

    expect(result.isSuccess()).to.be.true;
    expect(prompts.overwritePortal.called).to.be.false;
    expect(inPortal('old.html')).to.be.false;
    expect(inPortal('index.html')).to.be.true;
  });

  it('writes the built site to the destination, with the not-found page static hosts need', async () => {
    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect(inPortal('index.html')).to.be.true;
    expect(inPortal('404.html')).to.be.true;
    expect(prompts.portalGenerated.calledOnceWith(portalDirectory)).to.be.true;
    expect(prompts.nextSteps.calledOnceWith(portalDirectory, false)).to.be.true;
  });

  it('writes an archive instead when asked', async () => {
    const result = await execute(FIXTURE, false, true);

    expect(result.isSuccess()).to.be.true;
    expect(inPortal('portal.zip')).to.be.true;
    expect(inPortal('index.html')).to.be.false;
    expect(prompts.nextSteps.calledOnceWith(portalDirectory, true)).to.be.true;
  });

  it('keeps the previous portal when the new one cannot be written', async () => {
    writeOldPortal();
    sinon.stub(FileService.prototype, 'copyDirectoryContents').rejects(new Error('ENOSPC: no space left on device'));

    const result = await execute(FIXTURE, true);

    expect(result.isFailed()).to.be.true;
    expect(inPortal('old.html')).to.be.true;
    expect(inPortal('index.html')).to.be.false;
    expect(inPortal('.apimatic-staging')).to.be.false;
    expect(prompts.portalGenerated.called).to.be.false;
  });

  it('keeps the staged site when the previous portal cannot be replaced', async () => {
    writeOldPortal();
    sinon.stub(FileService.prototype, 'cleanDirectoryExcluding').rejects(new Error('EBUSY: resource busy or locked'));

    const result = await execute(FIXTURE, true);

    expect(result.isFailed()).to.be.true;
    expect(inPortal('old.html')).to.be.true;
    expect(inPortal('.apimatic-staging/index.html')).to.be.true;
    expect(inPortal('.apimatic-staging/404.html')).to.be.true;
    expect(prompts.portalGenerated.called).to.be.false;
  });

  it('still reports a failed build when the build log cannot be written', async () => {
    build.resolves(err({ message: 'The portal build failed.', log: 'error: boom' }));
    sinon.stub(FileService.prototype, 'writeContents').rejects(new Error('EACCES: permission denied'));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.buildFailed.calledOnceWith('error: boom', null)).to.be.true;
  });

  it('keeps the build log beside the portal when the build fails', async () => {
    build.resolves(err({ message: 'The portal build failed.', log: 'error: boom' }));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    const logPath = path.join(portalDirectory.toString(), 'apimatic-debug', 'build.log');
    expect(fs.readFileSync(logPath, 'utf8')).to.equal('error: boom');
    expect(prompts.buildFailed.calledOnce).to.be.true;
    expect(prompts.buildFailed.firstCall.args[0]).to.equal('error: boom');
  });

  it('warns about static files that replace generated ones, and builds anyway', async () => {
    const source = new DirectoryPath(root).join('shadowing');
    fs.cpSync(FIXTURE.toString(), source.toString(), { recursive: true });
    fs.writeFileSync(path.join(source.toString(), 'static', 'robots.txt'), 'User-agent: *\n');

    const result = await execute(source);

    expect(result.isSuccess()).to.be.true;
    expect(prompts.filesShadowedByStatic.firstCall.args[0].map(String)).to.deep.equal(['robots.txt']);
  });
});
