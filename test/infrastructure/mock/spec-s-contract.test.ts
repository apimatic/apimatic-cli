import { randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { jsonDifferences, mockOver, placesOf, TestMock } from '../../helpers/mock-http.js';
import { authorizationCodeToken, clientCredentialsToken, oauth2 } from '../../helpers/mock-oauth2.js';
import { ledger, TestRequest } from '../../helpers/mock-requests.js';
import { specS } from '../../helpers/mock-spec-s.js';
import { fixtureStubs } from '../../helpers/mock-stubs.js';

/** How a generated test authenticates a request to one of the Spec S operations. */
type ErrorAuth = 'bearer' | 'bearerAndKey' | 'queryKey' | 'authCode' | 'clientCredentials';
type DeclaredError = readonly [method: string, path: string, auth: ErrorAuth, status: number, code: string];

const A = `/v1/accounts/${specS.accountA}`;
const C = `/v1/accounts/${specS.accountC}`;
const T2 = `/v1/transactions/${specS.transactionT2}`;
const RENDER = `/v1/statements/${specS.statementS1}/render`;
const CONTENT = `/v1/documents/${specS.documentD1}/content`;

const DECLARED_ERRORS: readonly DeclaredError[] = [
  ['GET', '/v1/accounts', 'bearer', 401, 'unauthorized'],
  ['GET', '/v1/accounts', 'bearer', 500, 'internal_error'],
  ['POST', '/v1/accounts', 'bearerAndKey', 400, 'validation_failed'],
  ['POST', '/v1/accounts', 'bearerAndKey', 409, 'account_exists'],
  ['POST', '/v1/accounts', 'bearerAndKey', 429, 'rate_limited'],
  ['POST', '/v1/accounts', 'bearerAndKey', 500, 'internal_error'],
  ['GET', A, 'bearer', 404, 'not_found'],
  ['GET', A, 'bearer', 422, 'invalid_identifier'],
  ['GET', A, 'bearer', 500, 'internal_error'],
  ['PATCH', A, 'authCode', 400, 'validation_failed'],
  ['PATCH', A, 'authCode', 404, 'not_found'],
  ['PATCH', A, 'authCode', 500, 'internal_error'],
  ['DELETE', C, 'authCode', 404, 'not_found'],
  ['DELETE', C, 'authCode', 409, 'balance_not_zero'],
  ['DELETE', C, 'authCode', 500, 'internal_error'],
  ['GET', `${A}/balance`, 'queryKey', 404, 'not_found'],
  ['GET', `${A}/balance`, 'queryKey', 500, 'internal_error'],
  ['GET', `${A}/summary`, 'bearer', 404, 'not_found'],
  ['GET', `${A}/summary`, 'bearer', 500, 'internal_error'],
  ['GET', `${A}/transactions`, 'bearer', 404, 'not_found'],
  ['GET', `${A}/transactions`, 'bearer', 500, 'internal_error'],
  ['POST', `${A}/transactions`, 'clientCredentials', 400, 'validation_failed'],
  ['POST', `${A}/transactions`, 'clientCredentials', 404, 'not_found'],
  ['POST', `${A}/transactions`, 'clientCredentials', 429, 'rate_limited'],
  ['POST', `${A}/transactions`, 'clientCredentials', 500, 'ledger_unavailable'],
  ['GET', `${A}/events`, 'bearer', 404, 'not_found'],
  ['GET', `${A}/events`, 'bearer', 500, 'internal_error'],
  ['GET', T2, 'bearer', 404, 'not_found'],
  ['GET', T2, 'bearer', 500, 'internal_error'],
  ['POST', '/v1/transaction-searches', 'bearer', 400, 'validation_failed'],
  ['POST', '/v1/transaction-searches', 'bearer', 500, 'internal_error'],
  ['GET', '/v1/transaction-exports', 'bearer', 401, 'unauthorized'],
  ['GET', '/v1/transaction-exports', 'bearer', 500, 'internal_error'],
  ['GET', '/v1/categories', 'bearer', 401, 'unauthorized'],
  ['GET', '/v1/categories', 'bearer', 500, 'internal_error'],
  ['GET', '/v1/statements', 'bearer', 401, 'unauthorized'],
  ['GET', '/v1/statements', 'bearer', 500, 'internal_error'],
  ['POST', RENDER, 'bearer', 404, 'not_found'],
  ['POST', RENDER, 'bearer', 503, 'renderer_overloaded'],
  ['POST', RENDER, 'bearer', 500, 'internal_error'],
  ['POST', '/v1/documents', 'bearer', 400, 'validation_failed'],
  ['POST', '/v1/documents', 'bearer', 413, 'payload_too_large'],
  ['POST', '/v1/documents', 'bearer', 500, 'internal_error'],
  ['GET', CONTENT, 'bearer', 404, 'not_found'],
  ['GET', CONTENT, 'bearer', 500, 'internal_error'],
  ['PUT', CONTENT, 'bearer', 404, 'not_found'],
  ['PUT', CONTENT, 'bearer', 500, 'internal_error'],
  ['GET', '/v1/audit-events', 'authCode', 403, 'insufficient_scope'],
  ['GET', '/v1/audit-events', 'authCode', 500, 'internal_error'],
  ['POST', '/v1/webhook-endpoints', 'bearer', 400, 'validation_failed'],
  ['POST', '/v1/webhook-endpoints', 'bearer', 500, 'internal_error']
];

async function authorized(request: TestRequest, auth: ErrorAuth, mock: TestMock): Promise<TestRequest> {
  switch (auth) {
    case 'bearer':
      return request.bearer();
    case 'bearerAndKey':
      return request.bearer().apiKey();
    case 'queryKey':
      return request.query('api_key', ledger.apiKey);
    case 'authCode':
      return request.bearer(await authorizationCodeToken(mock));
    case 'clientCredentials':
      return request.bearer(await clientCredentialsToken(mock));
  }
}

describe('the Spec S contract over HTTP', () => {
  const mock = mockOver('spec-s');

  describe('the authorization server', () => {
    it('issues the client credentials token to a secret sent in the form', async () => {
      const response = await mock().send(oauth2.clientCredentials());

      const token = response.expectJson(200);
      expect([token.access_token, token.token_type, 'refresh_token' in token]).to.deep.equal([
        ledger.clientCredentialsToken,
        'Bearer',
        false
      ]);
    });

    it('issues the client credentials token to a secret sent in a Basic header', async () => {
      const response = await mock().send(oauth2.clientCredentialsBasic());

      expect(response.expectJson(200).access_token).to.equal(ledger.clientCredentialsToken);
    });

    it('answers 418 to a wrong secret, naming it', async () => {
      const request = oauth2.token(
        ['grant_type', 'client_credentials'],
        ['client_id', ledger.clientId],
        ['client_secret', 'nope']
      );

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('auth client_secret');
    });

    it('issues a refreshable token for an authorization code with PKCE', async () => {
      const consent = await mock().send(oauth2.authorize());

      const response = await mock().send(oauth2.exchange(oauth2.codeIn(consent.header('Location'))));

      const { access_token, refresh_token, scope } = response.expectJson(200);
      expect([access_token, refresh_token, scope]).to.deep.equal([
        'ac-access-token-1',
        'ac-refresh-token-1',
        'ledger:write audit:read'
      ]);
    });

    it('rotates both tokens on a refresh', async () => {
      const response = await mock().send(oauth2.refresh('ac-refresh-token-1'));

      const { access_token, refresh_token } = response.expectJson(200);
      expect([access_token, refresh_token]).to.deep.equal(['ac-access-token-2', 'ac-refresh-token-2']);
    });

    it('answers 418 to a verifier that did not make the challenge', async () => {
      const consent = await mock().send(oauth2.authorize());
      const request = oauth2.exchange(
        oauth2.codeIn(consent.header('Location')),
        'not-the-verifier-that-made-the-challenge-0123456789'
      );

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('form code_verifier');
    });

    it('redirects a consent request whose scopes are joined with +', async () => {
      const response = await mock().send(oauth2.authorizeFormEncoded());

      expect([response.status, response.header('Location').startsWith(`${oauth2.redirectUri}?code=`)]).to.deep.equal([
        302,
        true
      ]);
    });

    it('answers 418 to a consent request without PKCE, naming both parameters', async () => {
      const response = await mock().send(oauth2.authorizeWithout('code_challenge', 'code_challenge_method'));

      expect(placesOf(response.expectMismatch())).to.include.members([
        'query code_challenge',
        'query code_challenge_method'
      ]);
    });
  });

  describe('credentials and the closed query set', () => {
    it('names every accepted alternative to a request without credentials', async () => {
      const response = await mock().send(TestRequest.get('/v1/accounts'));

      expect(placesOf(response.expectMismatch())).to.include.members(['auth bearerAuth', 'auth apiKeyHeader']);
    });

    it('answers 418 to a wrong API key', async () => {
      const response = await mock().send(TestRequest.get('/v1/accounts').apiKey('wrong-key'));

      expect(placesOf(response.expectMismatch())).to.include('auth apiKeyHeader');
    });

    it('accepts the Bearer scheme in lower case, as RFC 9110 makes it case-insensitive', async () => {
      const request = TestRequest.get(A).header('Authorization', `bearer ${ledger.bearerToken}`);

      const response = await mock().send(request);

      expect(response.expectJson(200).id).to.equal(specS.accountA);
    });

    it('names a wrong token sent under the lower-case scheme as it was sent', async () => {
      const response = await mock().send(TestRequest.get(A).header('Authorization', 'bearer wrong-token'));

      const bearer = response.expectMismatch().filter((difference) => difference.name === 'bearerAuth');
      expect(bearer.map(({ expected, actual }) => [expected, actual])).to.deep.equal([
        ['header Authorization: Bearer test-bearer-token', 'bearer wrong-token']
      ]);
    });

    it('answers 418 to one of two credentials an operation requires together', async () => {
      const request = TestRequest.post('/v1/accounts')
        .bearer()
        .header('Idempotency-Key', specS.createAccountIdempotencyKey)
        .json(specS.createAccountBody);

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('auth apiKeyHeader');
    });

    it("names the operation's own schemes to a credential that is only the global one", async () => {
      const response = await mock().send(TestRequest.get(`${A}/balance`).bearer());

      expect(placesOf(response.expectMismatch())).to.include.members(['auth apiKeyQuery', 'auth basicAuth']);
    });

    for (const [what, key, value] of [
      ['a query parameter the operation does not declare', 'include_closed', 'true'],
      ['an API key in the query of an operation that takes it in a header', 'api_key', ledger.apiKey]
    ]) {
      it(`answers 418 to ${what}`, async () => {
        const response = await mock().send(TestRequest.get('/v1/accounts').query(key, value).bearer());

        expect(placesOf(response.expectMismatch())).to.include(`query ${key}`);
      });
    }
  });

  describe('declared errors', () => {
    for (const [method, path, auth, status, code] of DECLARED_ERRORS) {
      it(`serves ${code} to ${method} ${path} with Prefer: code=${status}`, async () => {
        const request = (await authorized(TestRequest.of(method, path), auth, mock())).prefer(`code=${status}`);

        const response = await mock().send(request);

        expect(response.expectJson(status).code).to.equal(code);
      });
    }

    it('has exactly one row in the table above for every error stub, GET /health 503 aside', () => {
      const stubs = fixtureStubs('spec-s').endpoints.filter((stub) => stub.kind === 'error');
      const rows = [...DECLARED_ERRORS.map(([method, path, , status]) => ({ method, path, status }))].concat({
        method: 'GET',
        path: '/health',
        status: 503
      });

      const answering = rows.map((row) => ({
        row,
        stubs: stubs
          .filter(
            ({ route, response }) =>
              route.method === row.method && response.status === row.status && route.path.matches(row.path)
          )
          .map((stub) => stub.name)
      }));

      expect([
        answering.filter((pair) => pair.stubs.length !== 1).map(({ row }) => `${row.method} ${row.path} ${row.status}`),
        stubs
          .map((stub) => stub.name)
          .filter((name) => answering.filter((pair) => pair.stubs.includes(name)).length !== 1)
      ]).to.deep.equal([[], []]);
    });

    it('answers 418 naming the schemes to an error request without credentials', async () => {
      const response = await mock().send(TestRequest.get(A).prefer('code=404'));

      expect(placesOf(response.expectMismatch())).to.include.members(['auth bearerAuth', 'auth apiKeyHeader']);
    });

    it('reports a degraded health check for Prefer: code=503', async () => {
      const response = await mock().send(TestRequest.get('/health').prefer('code=503'));

      expect(response.expectJson(503).status).to.equal('degraded');
    });

    it('carries Retry-After on a 429', async () => {
      const request = TestRequest.post(`${A}/transactions`)
        .bearer(await clientCredentialsToken(mock()))
        .prefer('code=429');

      const response = await mock().send(request);

      expect(response.header('Retry-After')).to.equal('1');
    });

    it('carries Retry-After on a 503', async () => {
      const response = await mock().send(TestRequest.post(RENDER).bearer().prefer('code=503'));

      expect(response.header('Retry-After')).to.equal('2');
    });

    it('answers 418 naming the Prefer header to a code the operation does not declare', async () => {
      const response = await mock().send(TestRequest.get('/v1/accounts').bearer().prefer('code=404'));

      expect(placesOf(response.expectMismatch())).to.include('header Prefer');
    });

    it('serves the success stub to a Prefer header that names no code', async () => {
      const response = await mock().send(TestRequest.get('/v1/accounts').bearer().prefer('return=minimal'));

      expect(jsonDifferences(specS.specExampleFirstPage, response.expect(200))).to.deep.equal([]);
    });
  });

  describe('the seven wire mutations', () => {
    const createTransaction = async (body: string, idempotencyKey: string = specS.createTransactionIdempotencyKey) =>
      TestRequest.post(`${A}/transactions`)
        .bearer(await clientCredentialsToken(mock()))
        .header('Idempotency-Key', idempotencyKey)
        .json(body);

    const listTransactions = (...pairs: [string, ...string[]][]) =>
      pairs
        .reduce((request, [key, ...values]) => request.query(key, ...values), TestRequest.get(`${A}/transactions`))
        .bearer();

    it('m1: names both keys of a renamed body key', async () => {
      const request = await createTransaction(
        '{"kind":"transfer","amount":"250.00","counterpartyAccountId":"0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e","memo":"Rent split"}'
      );

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include.members([
        'body /counterparty_account_id',
        'body /counterpartyAccountId'
      ]);
    });

    it('m2: names the method of a request sent with the wrong one', async () => {
      const request = TestRequest.put(A)
        .bearer(await authorizationCodeToken(mock()))
        .json(specS.updateAccountBody);

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('method');
    });

    it('m2: answers 400 to a method in lower case, which the HTTP parser refuses before any stub sees it', async () => {
      const answer = await mock().sendRaw('get', A, `Authorization: Bearer ${ledger.bearerToken}`);

      expect([answer.startsWith('HTTP/1.1 400 Bad Request'), answer.includes('Invalid method')]).to.deep.equal([
        true,
        true
      ]);
    });

    it('m3: names the path of a request sent to the wrong one', async () => {
      const response = await mock().send(TestRequest.get(`/v1/account/${specS.accountA}`).bearer());

      expect(placesOf(response.expectMismatch())).to.include('path');
    });

    it('m3: names the path, not a missing Prefer, for an identifier only the error stubs accept', async () => {
      const response = await mock().send(TestRequest.get(`/v1/accounts/${specS.accountB}`).bearer());

      expect(response.header('X-Mock-Mismatch')).to.equal(
        `closest 'getAccount 200 operating cash': path: expected ${A}, got /v1/accounts/${specS.accountB}`
      );
    });

    it('m4: names the scheme of dropped credentials', async () => {
      const response = await mock().send(TestRequest.get(T2));

      expect(placesOf(response.expectMismatch())).to.include('auth bearerAuth');
    });

    it('m5: names a renamed query parameter', async () => {
      const request = listTransactions(
        ['limit', '2'],
        ['type', 'transfer'],
        ['tag', 'rent', 'shared'],
        ['filter[min_amount]', '10.00'],
        ['filter[since]', '2026-01-01']
      );

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('query tag');
    });

    it('m5: names a dropped query parameter', async () => {
      const request = listTransactions(
        ['limit', '2'],
        ['type', 'transfer'],
        ['tags', 'rent', 'shared'],
        ['filter[since]', '2026-01-01']
      );

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('query filter[min_amount]');
    });

    it('m5: names a changed query value and the stub it was closest to', async () => {
      const request = TestRequest.get('/v1/accounts')
        .query('limit', '11')
        .query('status', 'active,frozen')
        .query('class', 'asset')
        .bearer();

      const response = await mock().send(request);

      expect([
        response.expectMismatch(),
        response.header('X-Mock-Mismatch').startsWith("closest 'listAccounts 200 filtered': ")
      ]).to.deep.equal([[{ where: 'query', name: 'limit', expected: '10', actual: '11' }], true]);
    });

    it("m6: serves the example exactly, so a renamed response key fails the test's own comparison", async () => {
      const served = (await mock().send(TestRequest.get('/v1/accounts').bearer())).expectJson(200);
      const { has_more: hasMore, ...rest } = served;

      const differences = jsonDifferences(specS.specExampleFirstPage, JSON.stringify({ ...rest, hasMore }));

      expect(differences.join('; ')).to.include('/has_more');
    });

    it('m7: names a header whose value changed', async () => {
      const request = await createTransaction(specS.specExampleTransfer, randomUUID());

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('header Idempotency-Key');
    });

    it('names a money amount sent as a number where the spec writes a string', async () => {
      const request = await createTransaction(
        '{"kind":"transfer","amount":250.00,"counterparty_account_id":"0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e","memo":"Rent split"}'
      );

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('body /amount');
    });
  });
});
