import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { parseQuery } from '../../src/types/mock/matching/query-string.js';
import { percentEncode } from '../../src/types/mock/text/percent.js';
import type { TestMock } from './mock-http.js';
import { ledger, TestRequest } from './mock-requests.js';

type Pairs = readonly (readonly [string, string])[];

const TOKEN_PATH = '/oauth2/token';
const AUTHORIZE_PATH = '/oauth2/authorize';
const REDIRECT_URI = 'http://localhost/callback';
const SCOPE = 'ledger:write audit:read';
/** The verifier and challenge of RFC 7636 appendix B. */
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const codeParameters: Pairs = [
  ['response_type', 'code'],
  ['client_id', ledger.clientId],
  ['redirect_uri', REDIRECT_URI],
  ['scope', SCOPE],
  ['state', 's1'],
  ['code_challenge', CHALLENGE],
  ['code_challenge_method', 'S256']
];
const implicitParameters: Pairs = [
  ['response_type', 'token'],
  ['client_id', ledger.clientId],
  ['redirect_uri', REDIRECT_URI],
  ['scope', SCOPE],
  ['state', 's1']
];

const authorizeWith = (parameters: Pairs): TestRequest =>
  parameters.reduce((request, [key, value]) => request.query(key, value), TestRequest.get(AUTHORIZE_PATH));
const replaced = (parameters: Pairs, key: string, value: string): Pairs =>
  parameters.map(([name, sent]) => [name, name === key ? value : sent]);
const without = (parameters: Pairs, keys: readonly string[]): Pairs =>
  parameters.filter(([name]) => !keys.includes(name));
const token = (...fields: Pairs): TestRequest => TestRequest.post(TOKEN_PATH).form(...fields);
const formEncoded = (value: string): string => percentEncode(value).replaceAll('%20', '+');

/** A missing Location would otherwise fail as a bare invalid URL, which does not say the consent was never redirected. */
function redirect(location: string): URL {
  if (location === '') {
    throw new Error('The consent response has no Location header.');
  }
  return new URL(location);
}

function valueIn(encoded: string, name: string): string {
  const values = parseQuery(encoded).filter(([key]) => key === name);
  if (values.length !== 1) {
    throw new Error(`Expected one '${name}' in '${encoded}' but found ${values.length}.`);
  }
  return values[0][1];
}

/** The requests an OAuth2 client sends to the sample authorization server, each right unless a test changes one thing. */
export const oauth2 = {
  tokenPath: TOKEN_PATH,
  authorizePath: AUTHORIZE_PATH,
  redirectUri: REDIRECT_URI,
  scope: SCOPE,
  verifier: VERIFIER,
  challenge: CHALLENGE,

  token,

  clientCredentials: (scope = 'ledger:write'): TestRequest =>
    token(
      ['grant_type', 'client_credentials'],
      ['client_id', ledger.clientId],
      ['client_secret', ledger.clientSecret],
      ['scope', scope]
    ),

  basicCredentials: (credentials: string): string => `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`,

  /** Client credentials in a Basic header: `credentials` is the `id:secret` text before it is encoded. */
  clientCredentialsBasic: (credentials = `${ledger.clientId}:${ledger.clientSecret}`, ...fields: Pairs): TestRequest =>
    token(['grant_type', 'client_credentials'], ...fields).header(
      'Authorization',
      oauth2.basicCredentials(credentials)
    ),

  password: (options: { username?: string; password?: string; scope?: string } = {}): TestRequest =>
    token(
      ['grant_type', 'password'],
      ['username', options.username ?? ledger.username],
      ['password', options.password ?? ledger.password],
      ['client_id', ledger.clientId],
      ['client_secret', ledger.clientSecret],
      ['scope', options.scope ?? 'ledger:write']
    ),

  partnerClientCredentials: (): TestRequest =>
    TestRequest.post('/partner/oauth2/token').form(
      ['grant_type', 'client_credentials'],
      ['client_id', ledger.partnerClientId],
      ['client_secret', ledger.partnerClientSecret]
    ),

  authorize: (key?: string, value = ''): TestRequest =>
    authorizeWith(key === undefined ? codeParameters : replaced(codeParameters, key, value)),
  authorizeWithout: (...keys: string[]): TestRequest => authorizeWith(without(codeParameters, keys)),
  authorizeImplicit: (key?: string, value = ''): TestRequest =>
    authorizeWith(key === undefined ? implicitParameters : replaced(implicitParameters, key, value)),
  authorizeImplicitWithout: (...keys: string[]): TestRequest => authorizeWith(without(implicitParameters, keys)),

  /** The consent request as Python, Go, JS and Ruby form encoders write it: a space as `+`, which `query` would send as `%20`. */
  authorizeFormEncoded: (): TestRequest =>
    TestRequest.get(
      `${AUTHORIZE_PATH}?${codeParameters.map(([key, value]) => `${formEncoded(key)}=${formEncoded(value)}`).join('&')}`
    ),

  exchange: (code: string, verifier: string = VERIFIER): TestRequest =>
    token(
      ['grant_type', 'authorization_code'],
      ['code', code],
      ['redirect_uri', REDIRECT_URI],
      ['client_id', ledger.clientId],
      ['code_verifier', verifier]
    ),

  refresh: (refreshToken: string, ...fields: Pairs): TestRequest =>
    token(['grant_type', 'refresh_token'], ['refresh_token', refreshToken], ['client_id', ledger.clientId], ...fields),

  challengeOf: (verifier: string): string => createHash('sha256').update(verifier, 'ascii').digest('base64url'),

  codeIn: (location: string): string => valueIn(redirect(location).search, 'code'),

  /** The access token in a redirect's fragment, where the implicit flow puts it. */
  tokenIn: (location: string): string => valueIn(redirect(location).hash.slice(1), 'access_token')
};

export async function clientCredentialsToken(mock: TestMock): Promise<string> {
  return (await mock.send(oauth2.clientCredentials())).expectJson(200).access_token;
}

/** Authorize with PKCE, follow the consent redirect by hand, exchange the code. */
export async function authorizationCodeToken(mock: TestMock): Promise<string> {
  const consent = await mock.send(oauth2.authorize());
  consent.expect(302);
  return (await mock.send(oauth2.exchange(oauth2.codeIn(consent.header('Location'))))).expectJson(200).access_token;
}
