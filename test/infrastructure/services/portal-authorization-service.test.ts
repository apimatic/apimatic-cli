import fs from 'fs';
import os from 'os';
import path from 'path';
import nock from 'nock';
import { expect } from 'chai';
import { PortalAuthorizationService } from '../../../src/infrastructure/services/portal-authorization-service';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { ServiceErrorCode } from '../../../src/infrastructure/service-error';
import { envInfo } from '../../../src/infrastructure/env-info';

const BASE_URL = 'http://portal-authorization.test';

const profile = (isOnPremGenerationAllowed: boolean) => ({
  Id: 'id',
  Email: 'user@example.com',
  FullName: 'User',
  SecurityStamp: '',
  tenantId: 'tenant',
  allowedLanguages: 0,
  isPackagePublishingAllowed: true,
  isOnPremGenerationAllowed,
  ApiCopilotKeys: []
});

describe('PortalAuthorizationService', () => {
  const service = new PortalAuthorizationService();
  let configDir: DirectoryPath;
  let configRoot: string;

  const storeKey = (authKey: string) =>
    fs.writeFileSync(path.join(configRoot, 'config.json'), JSON.stringify({ email: 'user@example.com', authKey }));

  const authorize = (flagKey: string | null = null) => service.authorize(configDir, 'bash', flagKey);

  // envInfo memoises the base URL in a static, so it has to be cleared on the way in and
  // out; otherwise whichever suite runs first pins the address for every suite after it.
  const clearCachedBaseUrl = () => {
    (envInfo.constructor as unknown as { cachedBaseUrl?: string }).cachedBaseUrl = undefined;
  };

  before(() => {
    process.env.APIMATIC_BASE_URL = BASE_URL;
    clearCachedBaseUrl();
  });

  after(() => {
    delete process.env.APIMATIC_BASE_URL;
    clearCachedBaseUrl();
  });

  beforeEach(() => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-auth-'));
    configDir = new DirectoryPath(configRoot);
    nock.cleanAll();
  });

  afterEach(() => {
    fs.rmSync(configRoot, { recursive: true, force: true });
    nock.cleanAll();
  });

  it('allows an account whose subscription includes on-premises generation', async () => {
    storeKey('stored-key');
    nock(BASE_URL).get('/account/profile').reply(200, profile(true));

    expect((await authorize()).isOk()).to.be.true;
  });

  it('prefers the flag key over the stored one', async () => {
    storeKey('stored-key');
    const scope = nock(BASE_URL)
      .matchHeader('Authorization', 'X-Auth-Key flag-key')
      .get('/account/profile')
      .reply(200, profile(true));

    expect((await authorize('flag-key')).isOk()).to.be.true;
    expect(scope.isDone()).to.be.true;
  });

  it('uses the stored key when no flag is given', async () => {
    storeKey('stored-key');
    const scope = nock(BASE_URL)
      .matchHeader('Authorization', 'X-Auth-Key stored-key')
      .get('/account/profile')
      .reply(200, profile(true));

    expect((await authorize()).isOk()).to.be.true;
    expect(scope.isDone()).to.be.true;
  });

  it('reports an account with no entitlement separately from one it could not reach', async () => {
    storeKey('stored-key');
    nock(BASE_URL).get('/account/profile').reply(200, profile(false));

    expect((await authorize())._unsafeUnwrapErr()).to.deep.equal({ kind: 'notEntitled' });
  });

  it('treats a rejected key as unauthenticated', async () => {
    storeKey('expired-key');
    nock(BASE_URL).get('/account/profile').reply(401, { message: 'Authorization has been denied.' });

    expect((await authorize())._unsafeUnwrapErr().kind).to.equal('unauthenticated');
  });

  it('treats a missing key as unauthenticated without calling the API', async () => {
    const scope = nock(BASE_URL).get('/account/profile').reply(200, profile(true));

    expect((await authorize())._unsafeUnwrapErr().kind).to.equal('unauthenticated');
    expect(scope.isDone(), 'no request should have been made').to.be.false;
  });

  it('fails closed when the subscription cannot be verified', async () => {
    storeKey('stored-key');
    nock(BASE_URL).get('/account/profile').reply(500);

    const failure = (await authorize())._unsafeUnwrapErr() as {
      kind: string;
      error: { code: ServiceErrorCode };
      host: string;
    };

    expect(failure.kind).to.equal('unverifiable');
    expect(failure.error.code).to.equal(ServiceErrorCode.ServerError);
    expect(failure.host).to.equal('portal-authorization.test');
  });

  it('fails closed when the API cannot be reached at all', async () => {
    storeKey('stored-key');
    nock(BASE_URL).get('/account/profile').replyWithError('socket hang up');

    expect((await authorize())._unsafeUnwrapErr().kind).to.equal('unverifiable');
  });
});
