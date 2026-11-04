import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import { SdkPublishAction } from '../../../src/actions/sdk/publish.js';
import { SdkPublishNonInteractiveAction } from '../../../src/actions/sdk/publish/non-interactive.js';
import { GitService } from '../../../src/infrastructure/git-service.js';
import { LauncherService } from '../../../src/infrastructure/launcher-service.js';
import { PublishingApiService } from '../../../src/infrastructure/services/publishing-api-service.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { SdkPublishPrompts } from '../../../src/prompts/sdk/publish.js';
import { SdkPublishNonInteractivePrompts } from '../../../src/prompts/sdk/publish/non-interactive.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileProblem } from '../../../src/types/file/file-problem.js';
import { GitContext } from '../../../src/types/git-context.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { PublishingProfileItem, PublishType } from '../../../src/types/publish-api/publishing-profile-item.js';
import { ProfileId } from '../../../src/types/publish/profile-id.js';
import { PublishingProfile } from '../../../src/types/publish/publishing-profile.js';
import { SemVersion } from '../../../src/types/publish/version.js';
import { YOURS_MARKER } from '../../../src/types/sdk/conflict-markers.js';
import { Language, Stability } from '../../../src/types/sdk/generate.js';
import { StabilityChoice } from '../../../src/types/sdk/stability-choice.js';
import { TempContext } from '../../../src/types/temp-context.js';
import { emptyGlobalGitConfig } from '../../helpers/git-environment.js';
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk publish', shell: 'test' };

describe('SdkPublishAction', () => {
  let root: string;
  let generates: (files: Files) => Promise<void>;
  let onPublishSdkError: sinon.SinonStub;
  let restoreConfig: () => void;

  const withoutPackageSettings = {
    getPackageConfigurationDataForLanguage: () => undefined
  } as unknown as PublishingProfile;

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));

  const execute = (dryRun = false, { force = true, canAsk = false, gitInit = true } = {}) =>
    new SdkPublishAction(new DirectoryPath(root), COMMAND_METADATA).execute(
      ProjectContext.in(new DirectoryPath(root)),
      sdk(),
      Language.PYTHON,
      Stability.STABLE,
      [PublishType.PackagePublishing],
      force,
      canAsk,
      gitInit,
      ProfileId.tryCreate('profile')._unsafeUnwrap(),
      SemVersion.tryCreate('1.0.0')._unsafeUnwrap(),
      withoutPackageSettings,
      dryRun,
      'summary',
      onPublishSdkError
    );

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-publish-'));
    ({ generates } = stubSdkGeneration(root));
    await generates({ 'README.md': '# sdk' });
    onPublishSdkError = sinon.stub();
    restoreConfig = emptyGlobalGitConfig(root);
  });

  afterEach(() => {
    restoreConfig();
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Every entry of the zip the service was handed, so a test can read what went up. */
  const uploads = (uploaded: string[]) =>
    sinon.stub(PublishingApiService.prototype, 'publishSdkPackage').callsFake(async (file) => {
      uploaded.push(...new AdmZip(file.toString()).getEntries().map((entry) => entry.entryName));
      return ok({ publishLogId: 'log', publishingLogUrl: 'https://logs.test/log' });
    });

  /** The generation's own messages, which these tests are not about. */
  const quietGeneration = () => {
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryInitialised');
    sinon.stub(SdkGeneratePrompts.prototype, 'shareHook');
  };

  const stubPublishing = () => {
    sinon.stub(SdkPublishPrompts.prototype, 'publishSdk').callsFake((fn) => fn);
    sinon.stub(SdkPublishPrompts.prototype, 'publishingRunningNotice');
    sinon.stub(SdkPublishPrompts.prototype, 'publishingLogsMessage');
    sinon.stub(SdkPublishPrompts.prototype, 'pollPublishingStatus').resolves('succeeded');
  };

  it('uploads the SDK without the CLI’s record, the repository or what its ignore rules keep out', async () => {
    await generates({
      'README.md': '# sdk',
      '.gitignore': 'node_modules/\n',
      'node_modules/dep.js': 'module.exports = {};'
    });
    quietGeneration();
    stubPublishing();
    const uploaded: string[] = [];
    const publishSdkPackage = uploads(uploaded);

    expect((await execute()).isSuccess()).to.be.true;

    expect(publishSdkPackage.calledOnce).to.be.true;
    expect(uploaded).to.have.members(['.gitignore', 'README.md']);
    expect(fs.existsSync(path.join(sdk().toString(), '.apimatic', 'generation.json'))).to.be.true;
    expect(fs.existsSync(path.join(sdk().toString(), 'node_modules', 'dep.js'))).to.be.true;
  });

  it('generates into the SDK directory on a dry run and opens it, uploading nothing', async () => {
    quietGeneration();
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
    quietGeneration();
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
      onPublishSdkError,
      profile.id,
      '1.0.0'
    );

    expect(result.isSuccess()).to.be.true;
    expect(fs.readFileSync(path.join(sdk().toString(), 'README.md'), 'utf8')).to.equal('# sdk');
    expect(opened.firstCall.args[0].isEqual(sdk())).to.be.true;
  });

  // Markers would go up with the rest, and the version would be recorded as published.
  it('publishes nothing, and ends as Action required, while the SDK still has conflicts to resolve', async () => {
    const v1: Files = {
      'README.md': '# sdk',
      'models/book.py': 'class Book:\n    # Price in USD.\n    price: float\n'
    };
    fs.mkdirSync(sdk().toString(), { recursive: true });
    (await new GitService().init(sdk()))._unsafeUnwrap();
    writeFiles(sdk().toString(), v1);
    (await new GitContext(sdk()).recordSnapshot(sdk(), Language.PYTHON, Stability.STABLE))._unsafeUnwrap();
    writeFiles(sdk().toString(), { 'models/book.py': v1['models/book.py'].replace('USD', 'USD, VAT included') });
    await generates({ ...v1, 'models/book.py': v1['models/book.py'].replace('USD', 'US dollars') });
    sinon.stub(SdkGeneratePrompts.prototype, 'repositoryFound');
    sinon.stub(SdkGeneratePrompts.prototype, 'shareHook');
    sinon.stub(SdkGeneratePrompts.prototype, 'conflictChoice').resolves('asPlaced');
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkMerged');
    sinon.stub(SdkGeneratePrompts.prototype, 'conflictSteps');
    const conflictsNotPublished = sinon.stub(SdkPublishPrompts.prototype, 'conflictsNotPublished');
    const publishSdkPackage = sinon.stub(PublishingApiService.prototype, 'publishSdkPackage');

    const result = await execute(false, { force: false, canAsk: true });

    expect(result.isActionRequired()).to.be.true;
    expect(conflictsNotPublished.calledOnce).to.be.true;
    expect(publishSdkPackage.called).to.be.false;
    expect(onPublishSdkError.called).to.be.false;
    expect(fs.readFileSync(path.join(sdk().toString(), 'models', 'book.py'), 'utf8')).to.contain(YOURS_MARKER);
  });

  it('reports an SDK it could not zip, without publishing', async () => {
    quietGeneration();
    const problem: FileProblem = { kind: 'zipFailed', reason: 'EACCES: permission denied' };
    const zip = sinon.stub(TempContext.prototype, 'zip').callThrough();
    zip.onSecondCall().resolves(err(problem));
    const publishSdkPackage = sinon.stub(PublishingApiService.prototype, 'publishSdkPackage');
    const sdkNotZipped = sinon.stub(SdkPublishPrompts.prototype, 'sdkNotZipped');

    expect((await execute()).isFailed()).to.be.true;
    expect(publishSdkPackage.called).to.be.false;
    expect(sdkNotZipped.firstCall.args[1]).to.equal(problem.reason);
    expect(onPublishSdkError.called).to.be.false;
  });
});
