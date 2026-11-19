import { jsonObject, jsonText, JsonValue, jsonWhole } from '../json/json-value.js';
import { Difference } from '../matching/difference.js';
import { RequestModel } from '../matching/request-model.js';
import { checkValue } from '../matching/value-check.js';
import { Verdict } from '../matching/verdict.js';
import {
  grantTypesOf,
  isRedirecting,
  OAuth2Flow,
  OAuth2Settings,
  RedirectingFlow,
  responseTypeOf
} from '../stub-format/oauth2-settings.js';
import { asciiUpperCase, equalsIgnoringAsciiCase } from '../text/ascii.js';
import { isAsciiDigit, isAsciiLetter } from '../text/characters.js';
import { percentEncode } from '../text/percent.js';
import { wholeNumber } from '../text/whole-number.js';
import { ClientAuthentication, clientAuthenticationOf } from './client-authentication.js';
import { Fields } from './fields.js';
import { readIssuedCode, writeIssuedCode } from './issued-code.js';
import { expectVerifier, isChallenge } from './pkce.js';

const TOKEN_REQUEST = 'OAuth2 token request';
const AUTHORIZATION_REQUEST = 'OAuth2 authorization request';
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
const MAX_REFRESH_NUMBER = 2_147_483_646;

type AuthorizationCodeFlow = Extract<OAuth2Flow, { kind: 'authorizationCode' }>;

/**
 * The authorization server an `oauth2` stub describes, served on the mock's origin at the stub's
 * token path and at the authorize path of each redirecting flow. It is stateless: the
 * authorization code carries the PKCE challenge, the granted scope and the redirect URI, and
 * refresh tokens are numbered, so refresh token n yields access and refresh token n + 1. A replayed
 * refresh token or code is therefore accepted. A wrong request is refused with the same 418 report
 * the stubs use rather than an RFC 6749 error body, so a generated test fails with the reason
 * spelled out instead of a bare "invalid_client".
 */
export class OAuth2Server {
  private readonly settings: OAuth2Settings;

  public constructor(settings: OAuth2Settings) {
    this.settings = settings;
  }

  /** Nothing for any path but the token path and the authorize paths, which leaves the request to the stubs. */
  public answer(request: RequestModel): Verdict | undefined {
    const { settings } = this;
    if (request.path === settings.tokenPath) {
      const differences = [
        ...expectMethod(request, 'POST'),
        ...Fields.headers(request).expectThat('Content-Type', FORM_CONTENT_TYPE, (value) =>
          asciiUpperCase(value).startsWith(asciiUpperCase(FORM_CONTENT_TYPE))
        )
      ];
      return unless(TOKEN_REQUEST, differences, () => grant(settings, request));
    }
    const flows = settings.flows.filter(isRedirecting).filter((flow) => flow.authorizePath === request.path);
    if (flows.length === 0) {
      return undefined;
    }
    return unless(AUTHORIZATION_REQUEST, expectMethod(request, 'GET'), () =>
      consent(settings, Fields.query(request), flows)
    );
  }
}

/**
 * Auto-consent: a request that passes every check is redirected at once. The response type picks
 * the flow among those at this path; the checks every flow shares come first in a refusal, the
 * flow's own after them.
 */
function consent(settings: OAuth2Settings, query: Fields, flows: readonly RedirectingFlow[]): Verdict {
  const scope = requestedScope(settings, query);
  const redirectUri = query.text('redirect_uri');
  const state = query.text('state');
  const shared = [
    ...query.expect('client_id', settings.clientId),
    ...query.expectThat(
      'redirect_uri',
      'an absolute non-file URI in printable ASCII, without a fragment',
      isRedirectUri
    ),
    ...query.expectThat('state', 'a non-empty value', (value) => value.length > 0),
    ...expectDeclaredScopes(settings, query)
  ];
  const chosen = flows.filter((flow) => responseTypeOf(flow) === query.text('response_type'));
  const [flow] = chosen;
  if (chosen.length !== 1) {
    const offered = alternatives(flows.map(responseTypeOf));
    return {
      kind: 'rejected',
      what: AUTHORIZATION_REQUEST,
      differences: [query.wrong('response_type', offered), ...shared]
    };
  }
  if (flow.kind === 'authorizationCode') {
    const differences = [
      ...shared,
      ...query.expect('code_challenge_method', 'S256'),
      ...query.expectThat('code_challenge', 'a base64url S256 challenge of 43 characters', isChallenge)
    ];
    const code = writeIssuedCode({ challenge: query.text('code_challenge'), scope, redirectUri });
    return unless(AUTHORIZATION_REQUEST, differences, () =>
      redirect(redirectUri, redirectUri.includes('?') ? '&' : '?', [
        ['code', code],
        ['state', state]
      ])
    );
  }
  return unless(AUTHORIZATION_REQUEST, shared, () =>
    redirect(redirectUri, '#', [
      ['access_token', flow.accessToken],
      ['token_type', 'Bearer'],
      ['expires_in', String(settings.expiresIn)],
      ...(scope.length > 0 ? [['scope', scope] as const] : []),
      ['state', state]
    ])
  );
}

/**
 * The consent redirect. The authorization-code flow puts the code in the query (RFC 6749 section
 * 4.1.2); the implicit flow puts the token in the fragment (section 4.2.2), which a user agent
 * keeps from the server the URI names.
 */
function redirect(redirectUri: string, separator: string, parameters: readonly (readonly [string, string])[]): Verdict {
  const encoded = parameters.map(([name, value]) => `${name}=${percentEncode(value)}`).join('&');
  const headers = [{ name: 'Location', value: `${redirectUri}${separator}${encoded}` }];
  return { kind: 'served', response: { status: 302, headers, body: { kind: 'empty' } } };
}

/**
 * The redirect URI is echoed into Location as sent, so it must be one a header carries intact:
 * printable ASCII without a space; no fragment, which RFC 6749 section 3.1.2 forbids and which
 * would swallow the code; and no file path, which one OS would read as a URI and another not. A
 * private-use scheme (RFC 8252, `com.example.app:/cb`) passes.
 */
function isRedirectUri(value: string): boolean {
  const colon = value.indexOf(':');
  const scheme = value.slice(0, Math.max(colon, 0));
  const isScheme =
    scheme.length >= 2 &&
    isAsciiLetter(scheme[0]) &&
    Array.from(scheme).every(
      (character) => isAsciiLetter(character) || isAsciiDigit(character) || '+-.'.includes(character)
    );
  return (
    isScheme &&
    colon < value.length - 1 &&
    !equalsIgnoringAsciiCase(scheme, 'file') &&
    Array.from(value).every((character) => character > ' ' && character <= '~' && character !== '#')
  );
}

/** The grant goes to the flow that offers it; any other grant type is refused naming every offered one. */
function grant(settings: OAuth2Settings, request: RequestModel): Verdict {
  const form = Fields.form(request);
  const client = clientAuthenticationOf(request, form);
  const grantType = form.text('grant_type');
  const offering = settings.flows.filter((flow) => grantTypesOf(flow).includes(grantType));
  const [flow] = offering;
  if (offering.length === 1 && flow.kind === 'clientCredentials') {
    const differences = [
      ...expectClientId(settings, client),
      ...expectClientSecret(settings, client),
      ...expectDeclaredScopes(settings, form)
    ];
    return unless(TOKEN_REQUEST, differences, () =>
      issued(settings, flow.accessToken, undefined, requestedScope(settings, form))
    );
  }
  if (offering.length === 1 && flow.kind === 'password') {
    // RFC 6749 section 4.3: the client authenticates as for client credentials, and the resource owner is the one the flow names.
    const differences = [
      ...expectClientId(settings, client),
      ...expectClientSecret(settings, client),
      ...form.expect('username', flow.username),
      ...form.expect('password', flow.password),
      ...expectDeclaredScopes(settings, form)
    ];
    return unless(TOKEN_REQUEST, differences, () =>
      issued(settings, flow.accessToken, undefined, requestedScope(settings, form))
    );
  }
  if (offering.length === 1 && flow.kind === 'authorizationCode') {
    return grantType === 'refresh_token'
      ? refreshTokenGrant(settings, form, client, flow)
      : authorizationCodeGrant(settings, form, client, flow);
  }
  const offered = settings.flows.flatMap(grantTypesOf);
  const expected = offered.length === 0 ? 'none (only the implicit flow is offered)' : alternatives(offered);
  return { kind: 'rejected', what: TOKEN_REQUEST, differences: [form.wrong('grant_type', expected)] };
}

/**
 * The code must be one this server issued, the verifier must hash to its challenge, and the
 * redirect URI must be the one it was issued for. A code whose scope the stub does not declare was
 * not issued here, whatever its shape: the consent endpoint refuses such a scope, so only a
 * hand-built code carries one.
 */
function authorizationCodeGrant(
  settings: OAuth2Settings,
  form: Fields,
  client: ClientAuthentication,
  flow: AuthorizationCodeFlow
): Verdict {
  const clientDifferences = [...expectClientId(settings, client), ...expectClientSecretIfSent(settings, client)];
  const code = readIssuedCode(form.text('code'));
  const declared =
    code !== undefined &&
    (code.scope.length === 0 || code.scope.split(' ').every((scope) => settings.scopes.includes(scope)));
  if (code === undefined || !declared) {
    const differences = [...clientDifferences, form.wrong('code', `a code issued by ${flow.authorizePath}`)];
    return { kind: 'rejected', what: TOKEN_REQUEST, differences };
  }
  const differences = [
    ...clientDifferences,
    ...expectVerifier(form, code.challenge),
    ...form.expectThat(
      'redirect_uri',
      `the redirect_uri sent to ${flow.authorizePath}`,
      (value) => value === code.redirectUri
    )
  ];
  return unless(TOKEN_REQUEST, differences, () =>
    issued(settings, `${flow.accessTokenPrefix}1`, `${flow.refreshTokenPrefix}1`, code.scope)
  );
}

/**
 * RFC 6749 section 6: a refresh may narrow the scope but names declared scopes only. The server
 * keeps no record of what the code granted, so the refreshed token leaves the scope out.
 */
function refreshTokenGrant(
  settings: OAuth2Settings,
  form: Fields,
  client: ClientAuthentication,
  flow: AuthorizationCodeFlow
): Verdict {
  const differences = [
    ...expectClientId(settings, client),
    ...expectClientSecretIfSent(settings, client),
    ...expectDeclaredScopes(settings, form)
  ];
  const number = refreshNumber(form.text('refresh_token'), flow.refreshTokenPrefix);
  if (number === undefined) {
    const expected = `${flow.refreshTokenPrefix}<n>`;
    return {
      kind: 'rejected',
      what: TOKEN_REQUEST,
      differences: [...differences, form.wrong('refresh_token', expected)]
    };
  }
  return unless(TOKEN_REQUEST, differences, () =>
    issued(settings, `${flow.accessTokenPrefix}${number + 1}`, `${flow.refreshTokenPrefix}${number + 1}`, '')
  );
}

/** The n of a refresh token that has a successor; the largest 32-bit number has none, so it is refused as a larger one is. */
function refreshNumber(token: string, prefix: string): number | undefined {
  const digits = token.startsWith(prefix) ? token.slice(prefix.length) : '';
  const number = wholeNumber(digits);
  return number === undefined || number > MAX_REFRESH_NUMBER ? undefined : number;
}

function expectClientId(settings: OAuth2Settings, client: ClientAuthentication): Difference[] {
  return checkValue('auth', 'client_id', { kind: 'exact', value: settings.clientId }, client.id);
}

function expectClientSecret(settings: OAuth2Settings, client: ClientAuthentication): Difference[] {
  return checkValue('auth', 'client_secret', { kind: 'exact', value: settings.clientSecret }, client.secret);
}

/**
 * A public client proves itself with PKCE alone; a secret it does send must still be right. An
 * empty secret is none (RFC 6749 section 2.3.1 lets a client omit an empty one), whether a Basic
 * header carries it (`id:`) or the form, where an empty parameter is already left out.
 */
function expectClientSecretIfSent(settings: OAuth2Settings, client: ClientAuthentication): Difference[] {
  const none = client.secret.length === 0 || (client.secret.length === 1 && client.secret[0] === '');
  return none ? [] : expectClientSecret(settings, client);
}

/**
 * Declared scopes only, in one parameter: a repeat read as absent would grant every declared
 * scope. RFC 6749 section 3.3 has no empty scope token, so a leading, trailing or doubled space
 * names an undeclared scope, the empty one.
 */
function expectDeclaredScopes(settings: OAuth2Settings, fields: Fields): Difference[] {
  const sent = fields.values('scope');
  if (sent.length >= 2) {
    return [fields.wrong('scope', 'one space-delimited scope parameter')];
  }
  const declared =
    settings.scopes.length === 0 ? 'no scope (the stub declares none)' : `one of ${settings.scopes.join(', ')}`;
  return [...new Set(sent.flatMap((scope) => scope.split(' ')))]
    .filter((scope) => !settings.scopes.includes(scope))
    .map((scope) => fields.wrong('scope', declared, scope));
}

function requestedScope(settings: OAuth2Settings, fields: Fields): string {
  const sent = fields.values('scope');
  return sent.length === 1 ? sent[0] : settings.scopes.join(' ');
}

/** "a", "a or b", "a, b or c": the choices in the report's words. */
function alternatives(choices: readonly string[]): string {
  if (choices.length === 0) {
    return 'none';
  }
  return choices.length === 1 ? choices[0] : `${choices.slice(0, -1).join(', ')} or ${choices[choices.length - 1]}`;
}

function issued(
  settings: OAuth2Settings,
  accessToken: string,
  refreshToken: string | undefined,
  scope: string
): Verdict {
  const token: [string, JsonValue][] = [
    ['access_token', jsonText(accessToken)],
    ['token_type', jsonText('Bearer')],
    ['expires_in', jsonWhole(settings.expiresIn)],
    ...(refreshToken === undefined ? [] : [['refresh_token', jsonText(refreshToken)] as [string, JsonValue]]),
    ...(scope.length === 0 ? [] : [['scope', jsonText(scope)] as [string, JsonValue]])
  ];
  const headers = [
    { name: 'Cache-Control', value: 'no-store' },
    { name: 'Pragma', value: 'no-cache' }
  ];
  return { kind: 'served', response: { status: 200, headers, body: { kind: 'json', json: jsonObject(token) } } };
}

/** Serves only when nothing differs; otherwise the rejection lists every difference found. */
function unless(what: string, differences: readonly Difference[], serve: () => Verdict): Verdict {
  return differences.length === 0 ? serve() : { kind: 'rejected', what, differences };
}

/** Exact, letter case included, as a stub's method is. */
function expectMethod(request: RequestModel, expected: string): Difference[] {
  return request.method === expected ? [] : [new Difference('method', '', expected, request.method)];
}
