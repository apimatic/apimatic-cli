import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'node:stream';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import { SdkPublishAction } from '../../../src/actions/sdk/publish.js';
import { PublishingApiService } from '../../../src/infrastructure/services/publishing-api-service.js';
import { SdkGenerationService } from '../../../src/infrastructure/services/sdk-generation-service.js';
import { ZipService } from '../../../src/infrastructure/zip-service.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { SdkPublishPrompts } from '../../../src/prompts/sdk/publish.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { PublishType } from '../../../src/types/publish-api/publishing-profile-item.js';
import { ProfileId } from '../../../src/types/publish/profile-id.js';
import { PublishingProfile } from '../../../src/types/publish/publishing-profile.js';
import { SemVersion } from '../../../src/types/publish/version.js';
import { Language, Stability } from '../../../src/types/sdk/generate.js';
import { TempContext } from '../../../src/types/temp-context.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'sdk publish', shell: 'test' };

describe('SdkPublishAction', () => {
  let root: string;
  let onPublishSdkError: sinon.SinonStub;

  const withoutPackageSettings = {
    getPackageConfigurationDataForLanguage: () => undefined
  } as unknown as PublishingProfile;

  const execute = () =>
    new SdkPublishAction(new DirectoryPath(root), COMMAND_METADATA).execute(
      ProjectContext.in(new DirectoryPath(root)),
      new DirectoryPath(path.join(root, 'sdk')),
      Language.PYTHON,
      [PublishType.PackagePublishing],
      true,
      ProfileId.tryCreate('profile')._unsafeUnwrap(),
      SemVersion.tryCreate('1.0.0')._unsafeUnwrap(),
      withoutPackageSettings,
      false,
      Stability.STABLE,
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

  it('reports an SDK it could not package, without publishing', async () => {
    const zip = sinon.stub(TempContext.prototype, 'zip').callThrough();
    zip.onSecondCall().resolves(err('EACCES: permission denied'));
    const publishSdkPackage = sinon.stub(PublishingApiService.prototype, 'publishSdkPackage');
    const sdkNotPackaged = sinon.stub(SdkPublishPrompts.prototype, 'sdkNotPackaged');

    expect((await execute()).isFailed()).to.be.true;
    expect(publishSdkPackage.called).to.be.false;
    expect(sdkNotPackaged.firstCall.args[1]).to.equal('EACCES: permission denied');
    expect(onPublishSdkError.called).to.be.false;
  });
});
