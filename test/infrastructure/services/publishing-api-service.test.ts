import fs from 'fs';
import os from 'os';
import path from 'path';
import nock from 'nock';
import { expect } from 'chai';
import { PublishingApiService } from '../../../src/infrastructure/services/publishing-api-service';
import { ServiceErrorCode } from '../../../src/infrastructure/service-error';
import { envInfo } from '../../../src/infrastructure/env-info';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { Language } from '../../../src/types/sdk/generate';
import { PublishType } from '../../../src/types/publish-api/publishing-profile-item';
import { ProfileId } from '../../../src/types/publish/profile-id';
import { SemVersion } from '../../../src/types/publish/version';

const PUBLISHING_URL = 'http://publishing.test';
const PROFILE_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const LOG = { publishLogId: 'log', publishingLogUrl: 'https://logs.test/log' };

describe('PublishingApiService', () => {
  const service = new PublishingApiService();
  let configRoot: string;
  let configDir: DirectoryPath;
  let sdkFile: FilePath;

  const storeKey = (authKey: string) =>
    fs.writeFileSync(path.join(configRoot, 'config.json'), JSON.stringify({ email: 'user@example.com', authKey }));

  const publish = (authKey: string | null = null) =>
    service.publishSdkPackage(
      sdkFile,
      ProfileId.tryCreate(PROFILE_ID)._unsafeUnwrap(),
      Language.PYTHON,
      SemVersion.tryCreate('1.0.0')._unsafeUnwrap(),
      [PublishType.PackagePublishing],
      configDir,
      'bash',
      authKey
    );

  const clearCachedPublishingUrl = () => {
    (envInfo.constructor as unknown as { cachedPublishingBaseUrl?: string }).cachedPublishingBaseUrl = undefined;
  };

  before(() => {
    process.env.APIMATIC_BASE_URL = `http://api.test;http://auth.test;${PUBLISHING_URL}`;
    clearCachedPublishingUrl();
  });

  after(() => {
    delete process.env.APIMATIC_BASE_URL;
    clearCachedPublishingUrl();
  });

  beforeEach(() => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'publishing-api-'));
    configDir = new DirectoryPath(configRoot);
    fs.writeFileSync(path.join(configRoot, 'sdk.zip'), 'zip');
    sdkFile = new FilePath(configDir, new FileName('sdk.zip'));
    nock.cleanAll();
  });

  afterEach(() => {
    fs.rmSync(configRoot, { recursive: true, force: true });
    nock.cleanAll();
  });

  it('publishes with the flag key when nobody is logged in', async () => {
    const scope = nock(PUBLISHING_URL)
      .matchHeader('Authorization', 'X-Auth-Key flag-key')
      .post(`/publish/${PROFILE_ID}/${Language.PYTHON}`)
      .reply(200, LOG);

    expect((await publish('flag-key'))._unsafeUnwrap()).to.deep.equal(LOG);
    expect(scope.isDone()).to.be.true;
  });

  it('prefers the flag key over the stored one when publishing', async () => {
    storeKey('stored-key');
    const scope = nock(PUBLISHING_URL)
      .matchHeader('Authorization', 'X-Auth-Key flag-key')
      .post(`/publish/${PROFILE_ID}/${Language.PYTHON}`)
      .reply(200, LOG);

    expect((await publish('flag-key')).isOk()).to.be.true;
    expect(scope.isDone()).to.be.true;
  });

  it('publishes with the stored key when no flag is given', async () => {
    storeKey('stored-key');
    const scope = nock(PUBLISHING_URL)
      .matchHeader('Authorization', 'X-Auth-Key stored-key')
      .post(`/publish/${PROFILE_ID}/${Language.PYTHON}`)
      .reply(200, LOG);

    expect((await publish()).isOk()).to.be.true;
    expect(scope.isDone()).to.be.true;
  });

  it('refuses to publish with neither a flag key nor a login', async () => {
    expect((await publish())._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.UnAuthorized);
  });

  it('reads the publishing log with the flag key when nobody is logged in', async () => {
    const scope = nock(PUBLISHING_URL)
      .matchHeader('Authorization', 'X-Auth-Key flag-key')
      .get('/publish-logs/log')
      .reply(200, { status: 'Succeeded' });

    expect((await service.getSdkPublishingLog('log', configDir, 'bash', 'flag-key')).isOk()).to.be.true;
    expect(scope.isDone()).to.be.true;
  });

  it('refuses to read the publishing log with neither a flag key nor a login', async () => {
    const result = await service.getSdkPublishingLog('log', configDir, 'bash');

    expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.UnAuthorized);
  });
});
