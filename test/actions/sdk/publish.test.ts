import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import { SdkPublishAction } from '../../../src/actions/sdk/publish.js';
import { SdkPublishNonInteractiveAction } from '../../../src/actions/sdk/publish/non-interactive.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { LauncherService } from '../../../src/infrastructure/launcher-service.js';
import { PublishingApiService } from '../../../src/infrastructure/services/publishing-api-service.js';
import { SdkGenerationService } from '../../../src/infrastructure/services/sdk-generation-service.js';
import { ZipService } from '../../../src/infrastructure/zip-service.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { SdkPublishPrompts } from '../../../src/prompts/sdk/publish.js';
import { SdkPublishNonInteractivePrompts } from '../../../src/prompts/sdk/publish/non-interactive.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { FileProblem } from '../../../src/types/file/file-problem.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { PublishingProfileItem, PublishType } from '../../../src/types/publish-api/publishing-profile-item.js';
import { ProfileId } from '../../../src/types/publish/profile-id.js';
import { PublishingProfile } from '../../../src/types/publish/publishing-profile.js';
import { SemVersion } from '../../../src/types/publish/version.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { StabilityChoice } from '../../../src/types/sdk/stability-choice.js';
import { TempContext } from '../../../src/types/temp-context.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk publish', shell: 'test' };

describe('SdkPublishAction', () => {
  let root: string;
  let onPublishSdkError: sinon.SinonStub;

  const withoutPackageSettings = {
    getPackageConfigurationDataForLanguage: () => undefined
  } as unknown as PublishingProfile;

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));

  const execute = (dryRun = false) =>
    new SdkPublishAction(new DirectoryPath(root), COMMAND_METADATA).execute(
      ProjectContext.in(new DirectoryPath(root)),
      sdk(),
      { language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.STABLE },
      [PublishType.PackagePublishing],
      { force: true, interaction: 'never' },
      ProfileId.tryCreate('profile')._unsafeUnwrap(),
      SemVersion.tryCreate('1.0.0')._unsafeUnwrap(),
      withoutPackageSettings,
      dryRun,
      'summary',
      onPublishSdkError
    );

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-publish-'));
    fs.mkdirSync(path.join(root, 'src', 'spec'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'spec', 'openapi.json'), '{}');

    const generated = path.join(root, 'generated');
    fs.mkdirSync(generated);
    fs.writeFileSync(path.join(generated, 'README.md'), '# sdk');
    fs.writeFileSync(path.join(generated, '.gitignore'), 'node_modules/\n');
    fs.mkdirSync(path.join(generated, 'node_modules'));
    fs.writeFileSync(path.join(generated, 'node_modules', 'dep.js'), 'module.exports = {};');
    const archive = new FilePath(new DirectoryPath(root), new FileName('sdk.zip'));
    (await new ZipService().archive(new DirectoryPath(generated), archive))._unsafeUnwrap();
    const sdkArchive = fs.readFileSync(archive.toString());

    sinon.stub(SdkGeneratePrompts.prototype, 'generateSdk').callsFake((fn) => fn);
    sinon.stub(SdkGenerationService.prototype, 'generateSdk').callsFake(async () => ok(Readable.from([sdkArchive])));
    onPublishSdkError = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('uploads the SDK without the CLI’s record, the repository or what its ignore rules keep out', async () => {
    await new GitService().init(new DirectoryPath(root));
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'shareHookInstalled');
    sinon.stub(SdkPublishPrompts.prototype, 'publishSdk').callsFake((fn) => fn);
    sinon.stub(SdkPublishPrompts.prototype, 'publishingRunningNotice');
    sinon.stub(SdkPublishPrompts.prototype, 'publishingLogsMessage');
    sinon.stub(SdkPublishPrompts.prototype, 'pollPublishingStatus').resolves('succeeded');
    const publishSdkPackage = sinon
      .stub(PublishingApiService.prototype, 'publishSdkPackage')
      .callsFake(async (file) => {
        const names = new AdmZip(file.toString()).getEntries().map((entry) => entry.entryName);
        return ok({ publishLogId: 'log', publishingLogUrl: `https://logs.test/${names.sort().join(',')}` });
      });

    expect((await execute()).isSuccess()).to.be.true;

    expect(publishSdkPackage.calledOnce).to.be.true;
    expect(fs.existsSync(path.join(sdk().toString(), '.apimatic', 'generation.json'))).to.be.true;
    const uploaded = (await publishSdkPackage.firstCall.returnValue)._unsafeUnwrap().publishingLogUrl;
    expect(uploaded).to.equal('https://logs.test/.gitignore,README.md');
  });

  it('generates into the SDK directory on a dry run and opens it, uploading nothing', async () => {
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryNotCreated');
    const dryRunNotice = sinon.stub(SdkPublishPrompts.prototype, 'dryRunNotice');
    const opened = sinon.stub(LauncherService.prototype, 'openDirectoryInEditorOrFileExplorer').resolves();
    const publishSdkPackage = sinon.stub(PublishingApiService.prototype, 'publishSdkPackage');

    expect((await execute(true)).isSuccess()).to.be.true;

    expect(fs.readFileSync(path.join(sdk().toString(), 'README.md'), 'utf8')).to.equal('# sdk');
    expect(opened.firstCall.args[0].isEqual(sdk())).to.be.true;
    expect(dryRunNotice.firstCall.args[0].isEqual(sdk())).to.be.true;
    expect(publishSdkPackage.called).to.be.false;
  });

  it('runs a dry run on the SDK directory the project names, not a throwaway one', async () => {
    const profile = {
      id: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
      name: 'profile',
      apiGroupId: 'group',
      apiGroupName: 'Group',
      cSharpConfiguration: null,
      goConfiguration: null,
      javaConfiguration: null,
      phpConfiguration: null,
      pythonConfiguration: null,
      rubyConfiguration: null,
      typeScriptConfiguration: null,
      cSharpGitConfiguration: null,
      goGitConfiguration: null,
      javaGitConfiguration: null,
      phpGitConfiguration: null,
      pythonGitConfiguration: { isEnabled: true, credentialsId: 'c', repositoryName: 'sdk', branch: 'main' },
      rubyGitConfiguration: null,
      typeScriptGitConfiguration: null
    } satisfies PublishingProfileItem;
    sinon.stub(PublishingApiService.prototype, 'getPublishingProfiles').resolves(ok([profile]));
    sinon.stub(SdkPublishNonInteractivePrompts.prototype, 'getPublishingProfiles').callsFake((fn) => fn);
    sinon.stub(SdkPublishNonInteractivePrompts.prototype, 'sourceCodeOnlyPublishingNotice');
    sinon.stub(SdkPublishNonInteractivePrompts.prototype, 'dryRunPluginConfigNotice');
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryNotCreated');
    sinon.stub(SdkPublishPrompts.prototype, 'dryRunNotice');
    const opened = sinon.stub(LauncherService.prototype, 'openDirectoryInEditorOrFileExplorer').resolves();

    const result = await new SdkPublishNonInteractiveAction(new DirectoryPath(root), COMMAND_METADATA).execute(
      ProjectContext.in(new DirectoryPath(root)),
      undefined,
      Language.PYTHON,
      [PublishType.SourceCodePublishing],
      true,
      true,
      StabilityChoice.for(Language.PYTHON, undefined),
      CodeGenerationVersion.V4,
      onPublishSdkError,
      profile.id,
      '1.0.0'
    );

    expect(result.isSuccess()).to.be.true;
    expect(fs.readFileSync(path.join(sdk().toString(), 'README.md'), 'utf8')).to.equal('# sdk');
    expect(opened.firstCall.args[0].isEqual(sdk())).to.be.true;
  });

  it('reports an SDK it could not zip, without publishing', async () => {
    const problem: FileProblem = { kind: 'zipFailed', reason: 'EACCES: permission denied' };
    const zip = sinon.stub(TempContext.prototype, 'zip').callThrough();
    zip.onSecondCall().resolves(err(problem));
    const publishSdkPackage = sinon.stub(PublishingApiService.prototype, 'publishSdkPackage');
    const sdkNotZipped = sinon.stub(SdkPublishPrompts.prototype, 'sdkNotZipped');

    expect((await execute()).isFailed()).to.be.true;
    expect(publishSdkPackage.called).to.be.false;
    expect(sdkNotZipped.firstCall.args[1]).to.equal(problem);
    expect(onPublishSdkError.called).to.be.false;
  });
});
