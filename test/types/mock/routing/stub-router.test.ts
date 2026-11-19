import { expect } from 'chai';
import { writeJson } from '../../../../src/types/mock/json/json-writer.js';
import { Verdict } from '../../../../src/types/mock/matching/verdict.js';
import { StubRouter } from '../../../../src/types/mock/routing/stub-router.js';
import { lifetimeOfSeconds } from '../../../../src/types/mock/routing/token-lifetime.js';
import { TestRequest } from '../../../helpers/mock-requests.js';
import { oauth2Stub, stubsOf, successStub } from '../../../helpers/mock-stubs.js';

const clientCredentials = (path = '/oauth2/token') =>
  TestRequest.post(path).form(['grant_type', 'client_credentials'], ['client_id', 'c'], ['client_secret', 's']).build();

const tokenOf = (verdict: Verdict): string => {
  if (verdict.kind !== 'served' || verdict.response.body.kind !== 'json') {
    throw new Error(`The verdict is ${verdict.kind}, not a served token.`);
  }
  return writeJson(verdict.response.body.json);
};

describe('StubRouter', () => {
  const templateOverTheTokenPath = {
    'a.json': successStub({
      method: 'POST',
      path: '/oauth2/{action}',
      body: '"body": { "any": true }',
      response: '{ "status": 200, "body": { "json": { "active": true } } }'
    }),
    'b.json': oauth2Stub()
  };

  it('lets the OAuth2 server answer its own path before a template stub of an earlier file', () => {
    const router = new StubRouter(stubsOf(templateOverTheTokenPath));

    const verdict = router.decide(clientCredentials());

    expect(tokenOf(verdict)).to.equal('{"access_token":"cc-access-token","token_type":"Bearer","expires_in":3600}');
  });

  it('leaves a path no OAuth2 server claims to the stubs', () => {
    const router = new StubRouter(stubsOf(templateOverTheTokenPath));

    const verdict = router.decide(clientCredentials('/oauth2/introspect'));

    expect(verdict.kind).to.equal('matched');
  });

  it("issues each stub's own lifetime unless one is named", () => {
    const router = new StubRouter(stubsOf({ 'a.json': oauth2Stub({ settings: '"expiresIn": 120' }) }));

    const verdict = router.decide(clientCredentials());

    expect(tokenOf(verdict)).to.include('"expires_in":120');
  });

  for (const path of ['/oauth2/token', '/other/token']) {
    it(`issues the named lifetime from the server at ${path}`, () => {
      const stubs = stubsOf({
        'a.json': oauth2Stub({ name: 'one' }),
        'b.json': oauth2Stub({ name: 'two', tokenPath: '/other/token' })
      });
      const router = new StubRouter(stubs, lifetimeOfSeconds(60));

      const verdict = router.decide(clientCredentials(path));

      expect(tokenOf(verdict)).to.equal('{"access_token":"cc-access-token","token_type":"Bearer","expires_in":60}');
    });
  }

  it('says that no stubs are loaded when there are none', () => {
    const router = new StubRouter(stubsOf({}));

    const verdict = router.decide(TestRequest.get('/v1/anything').build());

    expect(verdict.kind).to.equal('noStubs');
  });

  it('names the closest stub when none matches', () => {
    const router = new StubRouter(stubsOf({ 'a.json': successStub({ name: 'only' }) }));

    const verdict = router.decide(TestRequest.get('/v1/y').build());

    expect(verdict.kind === 'mismatch' && verdict.closest.stub.name).to.equal('only');
  });
});
