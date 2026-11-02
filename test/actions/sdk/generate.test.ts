import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { err } from 'neverthrow';
import sinon from 'sinon';
import { GenerateAction } from '../../../src/actions/sdk/generate.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileProblem } from '../../../src/types/file/file-problem.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { Language, Stability } from '../../../src/types/sdk/generate.js';
import { TempContext } from '../../../src/types/temp-context.js';
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk generate', shell: 'test' };
const GENERATED: Files = { 'README.md': '# sdk' };

describe('GenerateAction (sdk)', () => {
  let root: string;
  let generates: (files: Files) => Promise<void>;
  let generateSdk: sinon.SinonStub;

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));
  const at = (relative: string) => path.join(sdk().toString(), relative);
  const read = (relative: string) => fs.readFileSync(at(relative), 'utf-8');

  const execute = async (options: { force?: boolean; canAsk?: boolean; destination?: DirectoryPath } = {}) => {
    await generates(GENERATED);
    return new GenerateAction(new DirectoryPath(root), COMMAND_METADATA, 'auth-key').execute(
      ProjectContext.in(new DirectoryPath(root)),
      options.destination ?? sdk(),
      Language.PYTHON,
      Stability.STABLE,
      options.force ?? true,
      options.canAsk ?? false,
      false
    );
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-generate-'));
    ({ generates, generateSdk } = stubSdkGeneration(root));
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'gitInitSteps');
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('expands the generated SDK into the SDK directory', async () => {
    expect((await execute()).isSuccess()).to.be.true;

    expect(read('README.md')).to.equal('# sdk');
  });

  it('writes into the destination itself, with no language directory below it', async () => {
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

  it('reports a source directory it could not zip, without generating', async () => {
    const problem: FileProblem = { kind: 'zipFailed', reason: 'EACCES: permission denied' };
    sinon.stub(TempContext.prototype, 'zip').resolves(err(problem));
    const srcDirNotZipped = sinon.stub(SdkGeneratePrompts.prototype, 'srcDirNotZipped');

    expect((await execute()).isFailed()).to.be.true;
    expect(generateSdk.called).to.be.false;
    expect(srcDirNotZipped.firstCall.args[1]).to.equal(problem);
  });

  it('reports a generated SDK it cannot expand, with the reason it could not', async () => {
    const problem: FileProblem = { kind: 'unzipFailed', reason: 'Invalid or unsupported zip format' };
    sinon.stub(TempContext.prototype, 'unzip').resolves(err(problem));
    const sdkNotUnzipped = sinon.stub(SdkGeneratePrompts.prototype, 'sdkNotUnzipped');

    expect((await execute()).isFailed()).to.be.true;

    expect(sdkNotUnzipped.firstCall.args[0]).to.equal(problem);
  });

  describe('the overwrite question', () => {
    beforeEach(() => writeFiles(sdk().toString(), { 'README.md': '# mine' }));

    it('stops before generating when the developer declines', async () => {
      const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
      sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');

      expect((await execute({ force: false, canAsk: true })).isCancelled()).to.be.true;

      expect(overwriteSdk.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(generateSdk.called).to.be.false;
      expect(read('README.md')).to.equal('# mine');
    });

    it('goes ahead on yes', async () => {
      sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(true);

      expect((await execute({ force: false, canAsk: true })).isSuccess()).to.be.true;

      expect(read('README.md')).to.equal('# sdk');
    });

    it('is not asked where nobody can answer it: the run fails, naming --force', async () => {
      const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk');
      const cannotAsk = sinon.stub(SdkGeneratePrompts.prototype, 'cannotAskToOverwrite');

      expect((await execute({ force: false, canAsk: false })).isFailed()).to.be.true;

      expect(overwriteSdk.called).to.be.false;
      expect(cannotAsk.firstCall.args[0].isEqual(sdk())).to.be.true;
      expect(generateSdk.called).to.be.false;
      expect(read('README.md')).to.equal('# mine');
    });

    it('is skipped by --force', async () => {
      const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk');

      expect((await execute({ force: true, canAsk: true })).isSuccess()).to.be.true;

      expect(overwriteSdk.called).to.be.false;
      expect(read('README.md')).to.equal('# sdk');
    });

    it('is asked before replacing a repository of the developer’s own that holds only hidden files besides .git', async () => {
      fs.rmSync(at('README.md'));
      (await new GitService().init(sdk()))._unsafeUnwrap();
      writeFiles(sdk().toString(), { '.github/workflows/publish.yml': 'on: push' });
      const overwriteSdk = sinon.stub(SdkGeneratePrompts.prototype, 'overwriteSdk').resolves(false);
      sinon.stub(SdkGeneratePrompts.prototype, 'destinationDirNotEmpty');

      expect((await execute({ force: false, canAsk: true })).isCancelled()).to.be.true;

      expect(overwriteSdk.calledOnce).to.be.true;
      expect(read('.github/workflows/publish.yml')).to.equal('on: push');
      expect(generateSdk.called).to.be.false;
    });
  });
});
