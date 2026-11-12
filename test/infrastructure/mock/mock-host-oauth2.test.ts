import { expect } from 'chai';
import { lifetimeOfSeconds } from '../../../src/types/mock/routing/token-lifetime.js';
import { mockOver, placesOf, tempMocks } from '../../helpers/mock-http.js';
import { oauth2 } from '../../helpers/mock-oauth2.js';
import { ledger, TestRequest } from '../../helpers/mock-requests.js';
import { oauth2Stub, successStub } from '../../helpers/mock-stubs.js';

const minimalClientCredentials = (path = '/oauth2/token') =>
  TestRequest.post(path).form(['grant_type', 'client_credentials'], ['client_id', 'c'], ['client_secret', 's']);

describe('the OAuth2 authorization server over HTTP, on the sample stubs', () => {
  const mock = mockOver('sample');
  const temp = tempMocks();

  describe('the authorize endpoint', () => {
    it('redirects a valid request with 302, the code and the state', async () => {
      const response = await mock().send(oauth2.authorize());

      const location = response.header('Location');
      expect([
        response.status,
        location.startsWith('http://localhost/callback?code=ac-code.'),
        location.endsWith('&state=s1')
      ]).to.deep.equal([302, true, true]);
    });

    it('echoes a redirect URI that holds the {{origin}} placeholder as sent, since only a stub resolves it', async () => {
      const response = await mock().send(oauth2.authorize('redirect_uri', 'http://localhost/{{origin}}/cb'));

      expect(response.header('Location').startsWith('http://localhost/{{origin}}/cb?code=ac-code.')).to.equal(true);
    });

    it('redirects an implicit request with the token in the fragment', async () => {
      const response = await mock().send(oauth2.authorizeImplicit());

      expect([response.status, oauth2.tokenIn(response.header('Location'))]).to.deep.equal([302, ledger.implicitToken]);
    });
  });

  describe('the token endpoint', () => {
    it('exchanges the code of the redirect for tokens, with no-store and no-cache', async () => {
      const consent = await mock().send(oauth2.authorize());

      const response = await mock().send(oauth2.exchange(oauth2.codeIn(consent.header('Location'))));

      expect([
        response.status,
        response.header('Content-Type'),
        response.header('Cache-Control'),
        response.header('Pragma'),
        response.text()
      ]).to.deep.equal([
        200,
        'application/json',
        'no-store',
        'no-cache',
        '{"access_token":"ac-access-token-1","token_type":"Bearer","expires_in":3600,"refresh_token":"ac-refresh-token-1","scope":"ledger:write audit:read"}'
      ]);
    });

    it('issues the next numbered pair for a refresh token', async () => {
      const response = await mock().send(oauth2.refresh('ac-refresh-token-1'));

      expect(response.text()).to.equal(
        '{"access_token":"ac-access-token-2","token_type":"Bearer","expires_in":3600,"refresh_token":"ac-refresh-token-2"}'
      );
    });

    it('issues the password token for the password grant', async () => {
      const response = await mock().send(oauth2.password());

      expect(response.expectJson(200).access_token).to.equal(ledger.passwordToken);
    });

    it('answers a wrong secret with the 418 report, never an RFC 6749 error body', async () => {
      const request = oauth2.token(
        ['grant_type', 'client_credentials'],
        ['client_id', ledger.clientId],
        ['client_secret', 'nope']
      );

      const response = await mock().send(request);

      expect([response.status, response.header('X-Mock-Mismatch'), response.json().title]).to.deep.equal([
        418,
        'OAuth2 token request rejected: auth client_secret: expected test-client-secret, got nope',
        'OAuth2 token request rejected'
      ]);
    });
  });

  describe('a second server', () => {
    it('issues its own token on its own path', async () => {
      const response = await mock().send(oauth2.partnerClientCredentials());

      expect(response.expectJson(200).access_token).to.equal(ledger.partnerToken);
    });

    it('is not the first: its client on the main path answers 418 naming the client', async () => {
      const request = oauth2.token(
        ['grant_type', 'client_credentials'],
        ['client_id', ledger.partnerClientId],
        ['client_secret', ledger.clientSecret]
      );

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('auth client_id');
    });
  });

  describe('beside the stubs', () => {
    it('answers its own path before a template stub of an earlier file that also matches it', async () => {
      const stubs = await temp.start({
        'a.json': successStub({
          method: 'POST',
          path: '/oauth2/{action}',
          body: '"body": { "any": true }',
          response: '{ "status": 200, "body": { "json": { "active": true } } }'
        }),
        'b.json': oauth2Stub()
      });

      const response = await stubs.send(minimalClientCredentials());

      expect(response.text()).to.equal('{"access_token":"cc-access-token","token_type":"Bearer","expires_in":3600}');
    });
  });

  describe('a token lifetime the host is given', () => {
    for (const path of ['/oauth2/token', '/other/token']) {
      it(`replaces expires_in on the server at ${path}`, async () => {
        const stubs = await temp.start(
          { 'a.json': oauth2Stub({ name: 'one' }), 'b.json': oauth2Stub({ name: 'two', tokenPath: '/other/token' }) },
          { tokenLifetime: lifetimeOfSeconds(60) }
        );

        const response = await stubs.send(minimalClientCredentials(path));

        expect(response.text()).to.equal('{"access_token":"cc-access-token","token_type":"Bearer","expires_in":60}');
      });
    }
  });
});
