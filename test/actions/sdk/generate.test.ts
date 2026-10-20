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
import { SdkPreparePrompts } from '../../../src/prompts/sdk/prepare.js';
import { SdkWritePrompts } from '../../../src/prompts/sdk/write.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { FileProblem } from '../../../src/types/file/file-problem.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord } from '../../../src/types/sdk/generation-record.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';
import { TempContext } from '../../../src/types/temp-context.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };

describe('GenerateAction (sdk)', () => {
  let root: string;
  let sdkDirectory: DirectoryPath;
  let sdkArchive: Buffer;
  let generateSdk: sinon.SinonStub;

  const execute = (options: { zip?: boolean; force?: boolean } = {}) =>
    new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(root)),
      sdkDirectory,
      Language.PYTHON,
      Stability.STABLE,
      options.force ?? true,
      options.zip ?? false
    );

  const sdk = () => sdkDirectory.join('python');
  const at = (relative: string) => path.join(sdk().toString(), relative);

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-generate-'));
    fs.mkdirSync(path.join(root, 'src', 'spec'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'spec', 'openapi.json'), '{}');
    sdkDirectory = new DirectoryPath(path.join(root, 'sdk'));

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

  it('reports an SDK it could not save, naming its language directory', async () => {
    const archive = sinon.stub(ZipService.prototype, 'archive').callThrough();
    archive.onSecondCall().resolves(err('ENOSPC: no space left on device, write'));
    const sdkNotSaved = sinon.stub(SdkWritePrompts.prototype, 'sdkNotSaved');
    const sdkGenerated = sinon.stub(SdkWritePrompts.prototype, 'sdkGenerated');

    expect((await execute({ zip: true })).isFailed()).to.be.true;
    expect(sdkNotSaved.firstCall.args[0]).to.deep.equal({
      kind: 'zipFailed',
      reason: 'ENOSPC: no space left on device, write',
      sdkDirectory: sdk()
    });
    expect(sdkGenerated.called).to.be.false;
  });

  it('writes a zip and nothing else with --zip', async () => {
    expect((await execute({ zip: true })).isSuccess()).to.be.true;

    expect(fs.readdirSync(sdk().toString())).to.deep.equal(['python.zip']);
  });

  it('stops before generating when the developer declines to overwrite', async () => {
    fs.mkdirSync(sdk().toString(), { recursive: true });
    fs.writeFileSync(at('README.md'), '# mine');
    sinon.stub(SdkPreparePrompts.prototype, 'overwriteSdk').resolves(false);
    sinon.stub(SdkPreparePrompts.prototype, 'destinationDirNotEmpty');

    expect((await execute({ force: false })).isCancelled()).to.be.true;

    expect(generateSdk.called).to.be.false;
    expect(fs.readFileSync(at('README.md'), 'utf-8')).to.equal('# mine');
  });

  it('expands the generated SDK into its language directory and records it for the next run', async () => {
    sinon.stub(SdkWritePrompts.prototype, 'repositoryInitialised');

    expect((await execute()).isSuccess()).to.be.true;

    expect(fs.readFileSync(at('README.md'), 'utf-8')).to.equal('# sdk');
    const record = GenerationRecord.parse(fs.readFileSync(at('.apimatic/generation.json'), 'utf-8'))!;
    const pristine = await new GitService().resolveRef(sdk(), SnapshotRef.pristine(''));
    expect(record.pristineCommit().isEqual(pristine!)).to.be.true;
  });

  it('writes the SDK as it always has when git is not there', async () => {
    sinon.stub(GitService.prototype, 'version').resolves(undefined);
    sinon.stub(SdkPreparePrompts.prototype, 'gitUnavailable');

    expect((await execute()).isSuccess()).to.be.true;

    expect(fs.readdirSync(sdk().toString())).to.deep.equal(['README.md']);
  });
});
