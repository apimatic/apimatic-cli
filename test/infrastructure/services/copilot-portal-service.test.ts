import nock from 'nock';
import { expect } from 'chai';
import { CopilotPortalService } from '../../../src/infrastructure/services/copilot-portal-service';
import { ServiceErrorCode } from '../../../src/infrastructure/service-error';
import { ServiceAddress } from '../../../src/types/portal/config/service-address';
import { PortalConfig } from '../../../src/types/portal/portal-config';
import { CopilotKey } from '../../../src/types/portal/copilot/copilot-key';
import { CopilotRegistration } from '../../../src/types/portal/copilot/copilot-registration';
import { closedPort } from '../../helpers/network';

const API_URL = 'http://localhost:8787';
const ADDRESS = ServiceAddress.parse(API_URL, 'APIMATIC_COPILOT_URL')._unsafeUnwrap();
const KEY = CopilotKey.parse(`pk_live_${'a'.repeat(32)}`)!;
const REGISTRATION = CopilotRegistration.of(
  PortalConfig.fromBlock(
    { site: { name: 'Acme Docs', url: 'https://example.com/docs' } },
    { name: 'Acme', description: '' }
  )._unsafeUnwrap(),
  [],
  'live'
)._unsafeUnwrap();

describe('CopilotPortalService', () => {
  const service = new CopilotPortalService(500);

  const register = () => service.register(ADDRESS, KEY, REGISTRATION, 'bash', 'auth-key');
  const revoke = () => service.revoke(ADDRESS, KEY.toString(), 'bash', 'auth-key');

  beforeEach(() => nock.cleanAll());

  afterEach(() => nock.cleanAll());

  describe('register', () => {
    it('puts the portal under its key with the APIMatic login, and reads whether it was new', async () => {
      let sent: unknown;
      const scope = nock(API_URL, {
        reqheaders: { authorization: 'X-Auth-Key auth-key', 'x-copilot-key': KEY.toString() }
      })
        .put('/v1/portals', (body: unknown) => {
          sent = body;
          return true;
        })
        .reply(201, { portalId: 'p-1' });

      expect((await register())._unsafeUnwrap()).to.equal('created');
      expect(scope.isDone()).to.be.true;
      expect(sent).to.deep.equal({
        name: 'Acme Docs',
        siteUrl: 'https://example.com/docs',
        allowedOrigins: ['https://example.com']
      });
    });

    it('reads an update of a portal the service already held for the account', async () => {
      nock(API_URL).put('/v1/portals').reply(200, {});

      expect((await register())._unsafeUnwrap()).to.equal('updated');
    });

    it("passes on the service's reason for refusing", async () => {
      const cases: [number, string, ServiceErrorCode][] = [
        [403, 'Your subscription does not include Ask AI.', ServiceErrorCode.Forbidden],
        [409, 'This key belongs to another account.', ServiceErrorCode.BadRequest],
        [429, 'This account has reached its limit of portals.', ServiceErrorCode.BadRequest],
        [400, "'allowedOrigins' must be a list of origins.", ServiceErrorCode.BadRequest]
      ];
      for (const [status, message, code] of cases) {
        nock(API_URL).put('/v1/portals').reply(status, { code: 'refused', message });

        const error = (await register())._unsafeUnwrapErr();

        expect(error.code, String(status)).to.equal(code);
        expect(error.errorMessage, String(status)).to.equal(message);
      }
    });

    it('asks the user to sign in again when the service rejects the login', async () => {
      nock(API_URL).put('/v1/portals').reply(401, { code: 'unauthorized', message: 'The auth key is not valid.' });

      const error = (await register())._unsafeUnwrapErr();

      expect(error.code).to.equal(ServiceErrorCode.UnAuthorized);
      expect(error.errorMessage).to.contain('The auth key is not valid.');
    });

    it('reports a service that cannot be reached', async () => {
      const closed = ServiceAddress.parse(`http://127.0.0.1:${await closedPort()}`, 'APIMATIC_COPILOT_URL');
      const result = await service.register(closed._unsafeUnwrap(), KEY, REGISTRATION, 'bash', 'auth-key');

      expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.NetworkError);
    });

    it('reports a service that does not answer in time', async () => {
      nock(API_URL).put('/v1/portals').delay(1000).reply(201, {});

      const error = (await register())._unsafeUnwrapErr();

      expect(error.code).to.equal(ServiceErrorCode.Timeout);
      expect(error.errorMessage).to.equal('The Ask AI service did not answer within 1 second.');
    });

    it('reports a server error', async () => {
      nock(API_URL).put('/v1/portals').reply(500);

      expect((await register())._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.ServerError);
    });
  });

  describe('revoke', () => {
    it('deletes the key named in the header, with the APIMatic login', async () => {
      const scope = nock(API_URL, {
        reqheaders: { authorization: 'X-Auth-Key auth-key', 'x-copilot-key': KEY.toString() }
      })
        .delete('/v1/portals')
        .reply(204);

      expect((await revoke())._unsafeUnwrap()).to.equal('revoked');
      expect(scope.isDone()).to.be.true;
    });

    it('treats a key the service does not know as nothing to revoke', async () => {
      nock(API_URL).delete('/v1/portals').reply(404, { code: 'unknown_key', message: 'No such key.' });

      expect((await revoke())._unsafeUnwrap()).to.equal('unknown');
    });

    it("passes on the service's refusal", async () => {
      nock(API_URL).delete('/v1/portals').reply(403, { code: 'forbidden', message: 'This key is not yours.' });

      expect((await revoke())._unsafeUnwrapErr().errorMessage).to.equal('This key is not yours.');
    });
  });
});
