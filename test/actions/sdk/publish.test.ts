import fs from 'fs';
import os from 'os';
import path from 'path';
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
import { Files, stubSdkGeneration, writeFiles } from '../../helpers/sdk-generation.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk publish', shell: 'test' };

describe('SdkPublishAction', () => {
  let root: string;
  let generates: (files: Files) => Promise<void>;
  let onPublishSdkError: sinon.SinonStub;

  const withoutPackageSettings = {
    getPackageConfigurationDataForLanguage: () => undefined
  } as unknown as PublishingProfile;

  const sdk = () => new DirectoryPath(path.join(root, 'sdk', 'python'));

  const execute = (dryRun = false, { force = true, canAsk = false } = {}) =>
    new SdkPublishAction(new DirectoryPath(root), COMMAND_METADATA).execute(
      ProjectContext.in(new DirectoryPath(root)),
      sdk(),
      Language.PYTHON,
      Stability.STABLE,
      [PublishType.PackagePublishing],
      force,
      canAsk,
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
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('generates into the SDK directory on a dry run and opens it, uploading nothing', async () => {
    sinon.stub(SdkGeneratePrompts.prototype, 'sdkGenerated');
    const dryRunNotice = sinon.stub(SdkPublishPrompts.prototype, 'dryRunNotice');
    const opened = sinon.stub(LauncherService.prototype, 'openDirectoryInEditorOrFileExplorer').resolves();
    const publishSdkPackage = sinon.stub(PublishingApiService.prototype, 'publishSdkPackage');

    expect((await execute(true)).isSuccess()).to.be.true;

    expect(fs.readFileSync(path.join(sdk().toString(), 'README.md'), 'utf8')).to.equal('# sdk');
    expect(opened.firstCall.args[0].isEqual(sdk())).to.be.true;
    expect(dryRunNotice.calledOnce).to.be.true;
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
