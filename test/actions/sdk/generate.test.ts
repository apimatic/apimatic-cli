import fs from 'fs';
import os from 'os';
import path from 'path';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import { GenerateAction } from '../../../src/actions/sdk/generate.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { SdkGenerationService } from '../../../src/infrastructure/services/sdk-generation-service.js';
import { ZipService } from '../../../src/infrastructure/zip-service.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { FileProblem } from '../../../src/types/file/file-problem.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord } from '../../../src/types/sdk/generation-record.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';
import { TempContext } from '../../../src/types/temp-context.js';
import { terminal } from '../../../src/infrastructure/terminal.js';
import { runMode } from '../../helpers/sdk-generation.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };

describe('GenerateAction (sdk)', () => {
  let root: string;
  let sdkArchive: Buffer;
  let generateSdk: sinon.SinonStub;

  const execute = (options: { force?: boolean; gitInit?: boolean; destination?: DirectoryPath } = {}) =>
    new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(root)),
      options.destination ?? sdk(),
      { language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.STABLE },
      runMode(options.force ?? true, options.gitInit)
    );

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));
  const at = (relative: string) => path.join(sdk().toString(), relative);

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-generate-'));
    fs.mkdirSync(path.join(root, 'src', 'spec'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'spec', 'openapi.json'), '{}');

    const generated = path.join(root, 'generated');
    fs.mkdirSync(generated);
    fs.writeFileSync(path.join(generated, 'README.md'), '# sdk');
    const archive = new FilePath(new DirectoryPath(root), new FileName('sdk.zip'));
    (await new ZipService().archive(new DirectoryPath(generated), archive))._unsafeUnwrap();
    sdkArchive = fs.readFileSync(archive.toString());

    sinon.stub(SdkGeneratePrompts.prototype, 'generateSdk').callsFake((fn) => fn);
    generateSdk = sinon
      .stub(SdkGenerationService.prototype, 'generateSdk')
      .callsFake(async () => ok(Readable.from([sdkArchive])));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports a source directory it could not zip, without generating', async () => {
    const problem: FileProblem = { kind: 'zipFailed', reason: 'EACCES: permission denied' };
    sinon.stub(TempContext.prototype, 'zip').resolves(err(problem));
    const srcDirNotZipped = sinon.stub(SdkGeneratePrompts.prototype, 'srcDirNotZipped');

    expect((await execute()).isFailed()).to.be.true;
    expect(generateSdk.called).to.be.false;
    expect(srcDirNotZipped.firstCall.args[1]).to.equal(problem);
  });

  it('reports a generated SDK it cannot expand, with the reason it could not', async () => {
    sdkArchive = Buffer.from('not a zip');
    const sdkNotUnzipped = sinon.stub(SdkGeneratePrompts.prototype, 'sdkNotUnzipped');

    expect((await execute()).isFailed()).to.be.true;
    const problem = sdkNotUnzipped.firstCall.args[0];
    expect(problem.kind).to.equal('unzipFailed');
    expect(problem.reason).to.not.be.empty;
  });

  it('stops before generating when the developer declines to overwrite', async () => {
    fs.mkdirSync(sdk().toString(), { recursive: true });
    fs.writeFileSync(at('README.md'), '# mine');
    sinon.stub(terminal, 'isInteractive').returns(true);
    sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
    sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');

    expect((await execute({ force: false })).isCancelled()).to.be.true;

    expect(generateSdk.called).to.be.false;
    expect(fs.readFileSync(at('README.md'), 'utf-8')).to.equal('# mine');
  });

  it('expands the generated SDK into its language directory and records it for the next run', async () => {
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
    sinon.stub(SdkGeneratePrompts.prototype, 'shareHookInstalled');

    expect((await execute({ gitInit: true })).isSuccess()).to.be.true;

    expect(fs.readFileSync(at('README.md'), 'utf-8')).to.equal('# sdk');
    const record = GenerationRecord.parse(fs.readFileSync(at('.apimatic/generation.json'), 'utf-8'))!;
    const pristine = (await new GitService().resolveRef(sdk(), SnapshotRef.pristine()))._unsafeUnwrap();
    expect(record.pristineCommit()).to.deep.equal(pristine);
  });

  it('writes the SDK as it always has when --git-init finds no git', async () => {
    sinon.stub(GitService.prototype, 'version').resolves(ok(undefined));
    const gitUnavailable = sinon.stub(SdkGeneratePrompts.prototype, 'gitUnavailable');

    expect((await execute({ gitInit: true })).isSuccess()).to.be.true;

    expect(gitUnavailable.calledOnce).to.be.true;

    expect(fs.readdirSync(sdk().toString())).to.deep.equal(['README.md']);
  });

  it('writes into the destination itself, with no language directory below it', async () => {
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
    const destination = new DirectoryPath(path.join(root, 'my-python-sdk'));

    expect((await execute({ destination })).isSuccess()).to.be.true;

    expect(fs.readFileSync(path.join(destination.toString(), 'README.md'), 'utf-8')).to.equal('# sdk');
    expect(fs.existsSync(path.join(destination.toString(), 'python'))).to.be.false;
  });

  for (const [named, destination] of [
    ['the project', () => new DirectoryPath(root)],
    ['the source directory', () => new DirectoryPath(path.join(root, 'src'))]
  ] as const) {
    it(`refuses ${named} as the destination, since writing the SDK would delete the source`, async () => {
      const destinationContainsSource = sinon.stub(SdkGeneratePrompts.prototype, 'destinationContainsSource');

      expect((await execute({ destination: destination() })).isFailed()).to.be.true;

      expect(destinationContainsSource.calledOnce).to.be.true;
      expect(generateSdk.called).to.be.false;
      expect(fs.existsSync(path.join(root, 'src', 'spec', 'openapi.json'))).to.be.true;
    });
  }
});
