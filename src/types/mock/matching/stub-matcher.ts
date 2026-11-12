import { AuthExpectation, Credential, EndpointStub, QueryExpectation, Route } from '../stub-format/stub.js';
import { accepts, openingOf } from '../stub-format/value-rule.js';
import { equalsIgnoringAsciiCase } from '../text/ascii.js';
import { bodyDifferences } from './body-match.js';
import { Difference } from './difference.js';
import { parsePreference } from './preference.js';
import { NamedValues, RequestModel } from './request-model.js';
import { checkValue, describeValues } from './value-check.js';

/**
 * Every way the request fails the stub; none means the stub answers it. All stubs check the route
 * and the `Prefer` preference; success stubs also check the query string and the body.
 */
export function differencesFrom(stub: EndpointStub, request: RequestModel): Difference[] {
  return [
    ...routeDifferences(stub.route, request),
    ...preferenceDifferences(stub, request),
    ...exactnessDifferences(stub, request)
  ];
}

/**
 * Whether the stub answers the request. The body is read only when the route and the preference
 * already fit, so on the way to a match a stub of another route costs no parse.
 */
export function answers(stub: EndpointStub, request: RequestModel): boolean {
  return (
    routeDifferences(stub.route, request).length === 0 &&
    preferenceDifferences(stub, request).length === 0 &&
    exactnessDifferences(stub, request).length === 0
  );
}

/** The method compares exactly, letter case included, as RFC 9110 section 9.1 says. */
function routeDifferences(route: Route, request: RequestModel): Difference[] {
  return [
    ...(route.method === request.method ? [] : [new Difference('method', '', route.method, request.method)]),
    ...(route.path.matches(request.path) ? [] : [new Difference('path', '', route.path.toString(), request.path)]),
    ...route.headers.flatMap(({ name, rule }) => checkValue('header', name, rule, request.header(name))),
    ...route.cookies.flatMap(({ name, rule }) => checkValue('cookie', name, rule, request.cookie(name))),
    ...authDifferences(route.auth, request)
  ];
}

/**
 * A stub answers only the request that asks for it. An error stub needs its own code asked for; a
 * success stub tolerates its own, so a test can always send the status it expects. Without an
 * example preference every stub answers and file order decides; with one, only the stub of that
 * name does.
 */
function preferenceDifferences(stub: EndpointStub, request: RequestModel): Difference[] {
  const asked = parsePreference(request.header('Prefer'));
  const status = stub.response.status;
  const differences: Difference[] = [];
  if (stub.kind === 'success' && asked.code !== undefined && asked.code !== status) {
    differences.push(
      new Difference('header', 'Prefer', `no code= preference, or code=${status}`, `code=${asked.code}`)
    );
  }
  if (stub.kind === 'error' && asked.code !== status) {
    const sent = asked.code === undefined ? 'absent' : `code=${asked.code}`;
    differences.push(new Difference('header', 'Prefer', `code=${status}`, sent));
  }
  if (asked.example !== undefined && asked.example !== stub.example) {
    const wanted =
      stub.example === undefined ? 'no example= preference (this stub has no example)' : `example=${stub.example}`;
    differences.push(new Difference('header', 'Prefer', wanted, `example=${asked.example}`));
  }
  return differences;
}

function exactnessDifferences(stub: EndpointStub, request: RequestModel): Difference[] {
  return stub.kind === 'success'
    ? [...queryDifferences(stub.query, stub.route.auth, request), ...bodyDifferences(stub.body, request)]
    : [];
}

/** Every declared key by its rule; in closed mode every other key is a mismatch, unless it belongs to a credential. */
function queryDifferences(query: QueryExpectation, auth: AuthExpectation, request: RequestModel): Difference[] {
  const undeclared = request.query.filter(
    (sent) => !query.rules.some((rule) => rule.name === sent.name) && !belongsToAuth(auth, request, sent)
  );
  return [
    ...query.rules.flatMap(({ name, rule }) => checkValue('query', name, rule, request.queryValues(name))),
    ...(query.mode === 'closed' ? undeclared : []).map(
      ({ name, values }) =>
        new Difference('query', name, 'absent (not a parameter of this stub)', describeValues(values))
    )
  ];
}

/**
 * A query credential's key is the credential's while it holds that credential's value, and while
 * no credential set is satisfied, since the auth report then names it. Beside a set that
 * authenticates without it, an empty or stale `api_key` is an extra parameter.
 */
function belongsToAuth(auth: AuthExpectation, request: RequestModel, sent: NamedValues): boolean {
  return auth.anyOf
    .flat()
    .filter((credential) => credential.in === 'query' && credential.name === sent.name)
    .some((credential) => accepts(credential.rule, sent.values) || authDifferences(auth, request).length > 0);
}

/** Any one credential set satisfies the request. When none does, the report lists every alternative, so the reader sees what would have worked. */
function authDifferences(auth: AuthExpectation, request: RequestModel): Difference[] {
  const attempts = auth.anyOf.map((set) => set.flatMap((credential) => credentialDifferences(credential, request)));
  if (attempts.length === 0 || attempts.some((attempt) => attempt.length === 0)) {
    return [];
  }
  if (attempts.length === 1) {
    return attempts[0];
  }
  const sets = auth.anyOf.map((set) => `[${set.map((credential) => credential.scheme).join(' + ')}]`);
  return [new Difference('auth', '', `one of ${sets.join(' or ')}`, 'none satisfied'), ...attempts.flat()];
}

/** The report shows the credential as sent, also when its scheme was read in the stub's spelling. */
function credentialDifferences(credential: Credential, request: RequestModel): Difference[] {
  const sent = presented(credential, request);
  const read = sent.map((value) => schemeAsStubbed(credential, value));
  return checkValue('auth', credential.scheme, credential.rule, read).map(
    (found) =>
      new Difference(
        found.where,
        found.name,
        `${credential.in} ${credential.name}: ${found.expected}`,
        describeValues(sent)
      )
  );
}

/**
 * RFC 9110 section 11.1: the scheme that opens an Authorization value is case-insensitive, the
 * credentials after it are not. A scheme sent in another letter case is read in the stub's
 * spelling, so `bearer t` meets `Bearer t` while the token still compares exactly.
 */
function schemeAsStubbed(credential: Credential, sent: string): string {
  const [scheme, rest] = splitAtFirstSpace(sent);
  const [stubbed, stubbedRest] = splitAtFirstSpace(openingOf(credential.rule));
  const isAuthorization = credential.in === 'header' && equalsIgnoringAsciiCase(credential.name, 'Authorization');
  return isAuthorization && rest !== undefined && stubbedRest !== undefined && equalsIgnoringAsciiCase(scheme, stubbed)
    ? `${stubbed} ${rest}`
    : sent;
}

function splitAtFirstSpace(text: string): [string, string | undefined] {
  const space = text.indexOf(' ');
  return space < 0 ? [text, undefined] : [text.slice(0, space), text.slice(space + 1)];
}

function presented(credential: Credential, request: RequestModel): readonly string[] {
  switch (credential.in) {
    case 'header':
      return request.header(credential.name);
    case 'query':
      return request.queryValues(credential.name);
    case 'cookie':
      return request.cookie(credential.name);
  }
}
