import { JsonValue } from '../json/json-value.js';
import { writeJson } from '../json/json-writer.js';
import { compareIgnoringAsciiCase, compareOrdinal, equalsIgnoringAsciiCase } from '../text/ascii.js';
import { decodeBase64 } from '../text/base64.js';
import { isAllDigits, isPrintableAscii, isToken } from '../text/characters.js';
import { parseMediaType } from '../text/media-type.js';
import { ADMIN_PREFIX, isUnderAdminPrefix } from './admin-prefix.js';
import { BodyExpectation, ContentExpectation, NamedRule, PartExpectation } from './body-expectation.js';
import { Instant } from './instant.js';
import {
  disagreement,
  given,
  has,
  integerOf,
  itemsOf,
  member,
  membersOf,
  requiredInteger,
  requiredText,
  textOf
} from './json-read.js';
import { readJsonRule } from './json-rule.js';
import {
  BOUNDARY_PUNCTUATION,
  DEFAULT_BOUNDARY,
  isValidBoundary,
  partsContainingTheDelimiter
} from './multipart-response.js';
import { OAUTH2_DEFAULTS, OAuth2Flow } from './oauth2-settings.js';
import { PathTemplate } from './path-template.js';
import { at, Site } from './site.js';
import { AuthExpectation, Credential, ErrorStub, OAuth2Stub, Route, Stub, SuccessStub } from './stub.js';
import {
  ContentResponse,
  DEFAULT_CHUNK_DELAY_MS,
  Header,
  mediaTypeOf,
  MultipartResponse,
  ResponseBody,
  ResponsePart,
  SseEvent,
  StubResponse
} from './stub-response.js';
import { ABSENT, ANY_VALUE, ValueRule } from './value-rule.js';

/** Where the parser says what is wrong; it then goes on with a placeholder, so one run reports every problem. */
export type Report = (site: Site, message: string) => void;

const ERROR_STUB_FORBIDS = ['body', 'query', 'queryMode'];

/**
 * Headers a stub's response does not state: the server writes the first three itself, and the rest
 * are request headers. The reference's engine dropped each without a word, so the format refuses them.
 */
const UNSTATED_HEADERS = [
  'Accept',
  'Connection',
  'Date',
  'Expect',
  'Host',
  'If-Modified-Since',
  'Proxy-Connection',
  'Range',
  'Referer',
  'Transfer-Encoding',
  'User-Agent'
];

/** RFC 9110 sections that end a response of this status at its headers. */
const WITHOUT_CONTENT: ReadonlyMap<number, string> = new Map([
  [204, '15.3.5'],
  [205, '15.3.6'],
  [304, '15.4.5']
]);

/**
 * Turns one schema-valid stub object into a stub. The schema has settled the shape, so this decides
 * meaning and reports what the schema leaves open: base64 that does not decode, a malformed path, a
 * date-time in no accepted spelling, a `$` rule spelled wrong, a header not every client can send,
 * a body on a status that has none, and the rules that depend on the stub's kind.
 */
export function parseStub(stub: JsonValue, site: Site, file: string, report: Report): Stub {
  const named = { stub: requiredText(member(stub, 'name'), at(site, 'name')), pointer: site.pointer };
  const kind = textOf(member(stub, 'kind')) ?? 'success';
  switch (kind) {
    case 'success':
      return parseSuccess(stub, named, file, report);
    case 'error':
      return parseError(stub, named, file, report);
    case 'oauth2':
      return parseOAuth2(stub, named, file, report);
    default:
      return disagreement(at(site, 'kind'), `success, error or oauth2, not '${kind}'`);
  }
}

function parseSuccess(stub: JsonValue, site: Site, file: string, report: Report): SuccessStub {
  const request = member(stub, 'request');
  const requestSite = at(site, 'request');
  const route = parseRoute(request, requestSite, report);
  const mode = textOf(member(request, 'queryMode')) ?? 'closed';
  if (mode !== 'closed' && mode !== 'open') {
    return disagreement(at(requestSite, 'queryMode'), `closed or open, not '${mode}'`);
  }
  return {
    kind: 'success',
    name: site.stub,
    file,
    ...optional('description', textOf(member(stub, 'description'))),
    operation: requiredText(member(stub, 'operation'), at(site, 'operation')),
    ...optional('example', parseExample(given(stub, 'example'), at(site, 'example'), report)),
    route,
    query: { rules: parseRules(member(request, 'query'), at(requestSite, 'query'), compareOrdinal, report), mode },
    body: parseRequestBody(given(request, 'body'), at(requestSite, 'body'), report),
    response: parseResponse(member(stub, 'response'), at(site, 'response'), route.method, report)
  };
}

function parseError(stub: JsonValue, site: Site, file: string, report: Report): ErrorStub {
  const request = member(stub, 'request');
  const route = parseRoute(request, at(site, 'request'), report);
  const response = parseResponse(member(stub, 'response'), at(site, 'response'), route.method, report);
  if (response.status < 400) {
    report(
      at(site, 'response', 'status'),
      `An error stub answers with a status of 400 or more, not ${response.status}.`
    );
  }
  for (const forbidden of ERROR_STUB_FORBIDS.filter((name) => has(request, name))) {
    report(
      at(site, 'request', forbidden),
      `An error stub matches the route, the credentials and Prefer: code=…, so it has no '${forbidden}'.`
    );
  }
  return {
    kind: 'error',
    name: site.stub,
    file,
    ...optional('description', textOf(member(stub, 'description'))),
    operation: requiredText(member(stub, 'operation'), at(site, 'operation')),
    ...optional('example', parseExample(given(stub, 'example'), at(site, 'example'), report)),
    route,
    response
  };
}

/**
 * A request names the example in its Prefer header, which is split at every `,` and `;` before a
 * quoted value is read, and a quoted value has no escape for `"`; a name holding one could never be
 * asked for, and only file order could reach its stub.
 */
function parseExample(node: JsonValue | undefined, site: Site, report: Report): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  const name = requiredText(node, site);
  if (Array.from(name).some((character) => ',;"'.includes(character))) {
    report(
      site,
      "Prefer separates preferences at ',' and ';' and has no escape for '\"' in a quoted value, so no request " +
        "could ask for this example; replace the character in the name and in the test's Prefer."
    );
  }
  return name;
}

function parseOAuth2(stub: JsonValue, site: Site, file: string, report: Report): OAuth2Stub {
  if (has(stub, 'example')) {
    report(at(site, 'example'), "An oauth2 stub is not selected by Prefer, so it has no 'example'.");
  }
  const settings = member(stub, 'oauth2');
  const settingsSite = at(site, 'oauth2');
  const tokenPath = literalPath(member(settings, 'tokenPath'), at(settingsSite, 'tokenPath'), report);
  const flows = membersOf(member(settings, 'flows')).map(([kind, flow]) =>
    parseFlow(kind, flow, tokenPath, at(settingsSite, 'flows', kind), report)
  );
  const scopes = itemsOf(member(settings, 'scopes')).map((scope, index) =>
    parseScope(scope, at(settingsSite, 'scopes', index), report)
  );
  return {
    kind: 'oauth2',
    name: site.stub,
    file,
    ...optional('description', textOf(member(stub, 'description'))),
    settings: {
      tokenPath,
      flows,
      clientId: requiredText(member(settings, 'clientId'), at(settingsSite, 'clientId')),
      clientSecret: requiredText(member(settings, 'clientSecret'), at(settingsSite, 'clientSecret')),
      scopes,
      expiresIn: integerOf(member(settings, 'expiresIn')) ?? OAUTH2_DEFAULTS.expiresIn
    }
  };
}

/** RFC 6749 section 3.3: a scope-token is %x21 / %x23-5B / %x5D-7E, since a space separates scopes on the wire. */
function parseScope(node: JsonValue, site: Site, report: Report): string {
  const scope = requiredText(node, site);
  const isScopeCharacter = (character: string) =>
    character === '!' || (character >= '#' && character <= '[') || (character >= ']' && character <= '~');
  if (!Array.from(scope).every(isScopeCharacter)) {
    report(
      site,
      "A scope is an RFC 6749 scope-token: printable ASCII without a space, '\"' or '\\', because a space " +
        'separates scopes on the wire.'
    );
  }
  return scope;
}

/** An empty object takes every default; only an authorize path has none. */
function parseFlow(kind: string, flow: JsonValue, tokenPath: string, site: Site, report: Report): OAuth2Flow {
  const text = (name: string, fallback: string) => textOf(member(flow, name)) ?? fallback;
  switch (kind) {
    case 'clientCredentials':
      return { kind, accessToken: text('accessToken', OAUTH2_DEFAULTS.clientCredentialsAccessToken) };
    case 'authorizationCode':
      return {
        kind,
        authorizePath: authorizePath(flow, tokenPath, site, report),
        accessTokenPrefix: text('accessTokenPrefix', OAUTH2_DEFAULTS.accessTokenPrefix),
        refreshTokenPrefix: text('refreshTokenPrefix', OAUTH2_DEFAULTS.refreshTokenPrefix)
      };
    case 'password':
      return {
        kind,
        username: text('username', OAUTH2_DEFAULTS.username),
        password: text('password', OAUTH2_DEFAULTS.password),
        accessToken: text('accessToken', OAUTH2_DEFAULTS.passwordAccessToken)
      };
    case 'implicit':
      return {
        kind,
        authorizePath: authorizePath(flow, tokenPath, site, report),
        accessToken: text('accessToken', OAUTH2_DEFAULTS.implicitAccessToken)
      };
    default:
      return disagreement(site, `clientCredentials, authorizationCode, password or implicit, not '${kind}'`);
  }
}

function authorizePath(flow: JsonValue, tokenPath: string, site: Site, report: Report): string {
  const pathSite = at(site, 'authorizePath');
  const path = literalPath(member(flow, 'authorizePath'), pathSite, report);
  if (path === tokenPath) {
    report(pathSite, 'The authorize path is the token path; the token endpoint would answer every consent request.');
  }
  return path;
}

function parseRoute(request: JsonValue | undefined, site: Site, report: Report): Route {
  for (const part of ['headers', 'cookies']) {
    for (const [name, rule] of membersOf(member(request, part))) {
      checkSendable(name, stringsIn(rule), at(site, part, name), report);
    }
  }
  return {
    method: requiredText(member(request, 'method'), at(site, 'method')),
    path: parsePath(requiredText(member(request, 'path'), at(site, 'path')), at(site, 'path'), report),
    headers: parseRules(member(request, 'headers'), at(site, 'headers'), compareIgnoringAsciiCase, report),
    cookies: parseRules(member(request, 'cookies'), at(site, 'cookies'), compareOrdinal, report),
    auth: parseAuth(member(request, 'auth'), at(site, 'auth'), report)
  };
}

/**
 * A header or cookie the stub expects must be one every client can send. Some clients refuse a
 * name outside the token set and a value outside printable ASCII; others send such a value as
 * Latin-1 and others as UTF-8. No one encoding serves them all, so the rule is refused rather than
 * passing in some languages only.
 */
function checkSendable(name: string, texts: string[], site: Site, report: Report): void {
  if (!isToken(name)) {
    report(
      site,
      "A header or cookie name is an RFC 9110 token: one or more letters, digits or !#$%&'*+-.^_`|~ " +
        "(no space or ':'); clients send nothing else."
    );
  }
  if (!texts.every(isPrintableAscii)) {
    report(
      site,
      'A header or cookie value is printable ASCII: some clients refuse to send anything else, and the ones ' +
        'that do send it disagree on its encoding.'
    );
  }
}

function stringsIn(node: JsonValue): string[] {
  switch (node.kind) {
    case 'object':
      return [...node.members.values()].flatMap(stringsIn);
    case 'array':
      return node.items.flatMap(stringsIn);
    case 'string':
      return [node.value];
    default:
      return [];
  }
}

/** A template with any fault is replaced by the root, so parsing goes on. */
function parsePath(template: string, site: Site, report: Report): PathTemplate {
  const parsed = PathTemplate.parse(template);
  parsed.mapErr((faults) => faults.forEach((fault) => report(site, fault)));
  if (isUnderAdminPrefix(template)) {
    report(site, `${template} is under ${ADMIN_PREFIX}, which the mock's admin API answers before any stub.`);
  }
  return parsed.unwrapOr(PathTemplate.root);
}

/** OAuth paths are literal; a template would make the token URL unguessable for the client. */
function literalPath(node: JsonValue | undefined, site: Site, report: Report): string {
  const path = requiredText(node, site);
  if (!parsePath(path, site, report).isLiteral()) {
    report(site, 'An OAuth2 endpoint path is literal; it cannot contain {parameters}.');
  }
  return path;
}

/** A rule per name, sorted; the schema decides where an array may appear, so an array is always the repeated form. */
function parseRules(
  node: JsonValue | undefined,
  site: Site,
  compare: (first: string, second: string) => number,
  report: Report
): NamedRule[] {
  return uniqueNames(membersOf(node), compare, site, 'names here are case-insensitive', report)
    .map(([name, rule]) => ({ name, rule: parseRule(rule, at(site, name), report) }))
    .sort((first, second) => compare(first.name, second.name));
}

function parseRule(node: JsonValue, site: Site, report: Report): ValueRule {
  switch (node.kind) {
    case 'null':
      return ABSENT;
    case 'array':
      return { kind: 'each', rules: node.items.map((item, index) => parseSingleRule(item, at(site, index), report)) };
    case 'object':
      return has(node, 'absent') ? ABSENT : objectRule(node, site, report);
    default:
      return { kind: 'exact', value: requiredText(node, site) };
  }
}

/** One item of a repeated value: exact text or a rule, never absent, because the schema allows no null there. */
function parseSingleRule(node: JsonValue, site: Site, report: Report): ValueRule {
  return node.kind === 'object' ? objectRule(node, site, report) : { kind: 'exact', value: requiredText(node, site) };
}

/** The value / startsWith / endsWith / contains / dateTime alternatives, shared by values and credentials. */
function objectRule(node: JsonValue, site: Site, report: Report): ValueRule {
  const text = (name: string) => requiredText(member(node, name), at(site, name));
  if (given(node, 'startsWith')) return { kind: 'startsWith', prefix: text('startsWith') };
  if (given(node, 'endsWith')) return { kind: 'endsWith', suffix: text('endsWith') };
  if (given(node, 'contains')) return { kind: 'contains', fragment: text('contains') };
  if (given(node, 'dateTime')) return dateTimeRule(text('dateTime'), at(site, 'dateTime'), report);
  return { kind: 'exact', value: text('value') };
}

/** A spelling no SDK would send is reported; the text is then matched exactly, so parsing goes on. */
function dateTimeRule(text: string, site: Site, report: Report): ValueRule {
  const instant = Instant.parse(text);
  if (instant === undefined) {
    report(site, Instant.notADateTime(text));
    return { kind: 'exact', value: text };
  }
  return { kind: 'dateTime', instant };
}

function parseAuth(node: JsonValue | undefined, site: Site, report: Report): AuthExpectation {
  return {
    anyOf: itemsOf(member(node, 'anyOf')).map((set, index) =>
      membersOf(set).map(([scheme, credential]) =>
        parseCredential(scheme, credential, at(site, 'anyOf', index, scheme), report)
      )
    )
  };
}

/** A credential in a header or cookie is held to what a client can send there; a query encodes any character. */
function parseCredential(scheme: string, credential: JsonValue, site: Site, report: Report): Credential {
  const location = requiredText(member(credential, 'in'), at(site, 'in'));
  if (location !== 'header' && location !== 'query' && location !== 'cookie') {
    return disagreement(at(site, 'in'), `header, query or cookie, not '${location}'`);
  }
  const name = requiredText(member(credential, 'name'), at(site, 'name'));
  if (location !== 'query') {
    const stated = membersOf(credential).filter(([key]) => key !== 'in' && key !== 'name');
    checkSendable(
      name,
      stated.flatMap(([, value]) => stringsIn(value)),
      site,
      report
    );
  }
  return { scheme, in: location, name, rule: objectRule(credential, site, report) };
}

function parseRequestBody(node: JsonValue | undefined, site: Site, report: Report): BodyExpectation {
  if (node?.kind !== 'object') {
    return { kind: 'none' };
  }
  if (has(node, 'any')) {
    return { kind: 'any' };
  }
  const form = member(node, 'form');
  if (form?.kind === 'object') {
    return { kind: 'form', fields: parseRules(form, at(site, 'form'), compareOrdinal, report) };
  }
  const multipart = member(node, 'multipart');
  if (multipart?.kind === 'object') {
    const partsSite = at(site, 'multipart', 'parts');
    const parts = membersOf(member(multipart, 'parts'))
      .map(([name, part]) => ({ name, parts: parseParts(part, at(partsSite, name), report) }))
      .sort((first, second) => compareOrdinal(first.name, second.name));
    return { kind: 'multipart', parts };
  }
  return parseContent(node, site, report);
}

/** One part, or an array of parts for a name the form sends more than once; the stub's order is the wire order. */
function parseParts(node: JsonValue, site: Site, report: Report): PartExpectation[] {
  return node.kind === 'array'
    ? node.items.map((part, index) => parsePart(part, at(site, index), report))
    : [parsePart(node, site, report)];
}

function parsePart(part: JsonValue, site: Site, report: Report): PartExpectation {
  const fileName = given(part, 'filename');
  const contentType = given(part, 'contentType');
  return {
    fileName: fileName ? { kind: 'exact', value: requiredText(fileName, at(site, 'filename')) } : ANY_VALUE,
    contentType: contentType ? parseRule(contentType, at(site, 'contentType'), report) : ANY_VALUE,
    content: parseContent(part, site, report)
  };
}

/** The json / text / bytes alternatives shared by request bodies and multipart parts. */
function parseContent(node: JsonValue, site: Site, report: Report): ContentExpectation {
  const json = member(node, 'json');
  if (json !== undefined) {
    for (const malformed of malformedRules(json, at(site, 'json'))) {
      report(at(malformed.site, malformed.name), malformed.message);
    }
    return { kind: 'json', json };
  }
  const text = given(node, 'text');
  return text
    ? { kind: 'text', text: requiredText(text, at(site, 'text')) }
    : { kind: 'bytes', bytes: parseBase64(member(node, 'bytes'), at(site, 'bytes'), report) };
}

/**
 * Every `$` rule spelled wrong anywhere in the document. The tree is kept as written: a misspelt
 * rule would compare as an ordinary object, so the report says why the stub does not do what its
 * author meant.
 */
function malformedRules(node: JsonValue, site: Site): { name: string; message: string; site: Site }[] {
  if (node.kind === 'array') {
    return node.items.flatMap((item, index) => malformedRules(item, at(site, index)));
  }
  if (node.kind !== 'object') {
    return [];
  }
  const reading = readJsonRule(node.members);
  switch (reading.kind) {
    case 'malformed':
      return [{ name: reading.name, message: reading.message, site }];
    case 'found':
      return [];
    case 'none':
      return [...node.members].flatMap(([name, value]) => malformedRules(value, at(site, name)));
  }
}

function parseBase64(node: JsonValue | undefined, site: Site, report: Report): Uint8Array {
  const bytes = decodeBase64(requiredText(node, site));
  if (bytes === undefined) {
    report(site, 'Not valid base64.');
  }
  return bytes ?? new Uint8Array();
}

/**
 * The chunk delay belongs to a streamed body, so it is applied to one and reported on any other. A
 * body on a status that HTTP ends at the headers is reported too. The request's method is needed
 * because a HEAD response is the one a stub may give a Content-Length without a body.
 */
function parseResponse(node: JsonValue | undefined, site: Site, method: string, report: Report): StubResponse {
  const status = requiredInteger(member(node, 'status'), at(site, 'status'));
  const body = parseResponseBody(given(node, 'body'), at(site, 'body'), report);
  const delay = integerOf(member(node, 'chunkDelayMs'));
  const streamed = body.kind === 'sse' || body.kind === 'ndjson';
  if (delay !== undefined && !streamed) {
    report(at(site, 'chunkDelayMs'), 'chunkDelayMs applies to sse and ndjson bodies only.');
  }
  const section = WITHOUT_CONTENT.get(status);
  if (body.kind !== 'empty' && section !== undefined) {
    report(at(site, 'body'), `A ${status} response cannot carry a body (RFC 9110 section ${section}).`);
  }
  const headers = parseHeaders(member(node, 'headers'), at(site, 'headers'), report);
  checkTransport(headers, at(site, 'headers'), method, status, body, report);
  return { status, headers, body: streamed && delay !== undefined ? { ...body, chunkDelayMs: delay } : body };
}

/**
 * Content-Length is set from the body the server writes, so a stub states one only where a response
 * has a length and no body: on a HEAD or a 304 (RFC 9110 section 8.6). A stated Content-Type on a
 * multipart body that does not name its boundary would serve parts no client can find, and one that
 * names another charset on a json or text body would mislabel the UTF-8 it is sent as.
 */
function checkTransport(
  headers: readonly Header[],
  site: Site,
  method: string,
  status: number,
  body: ResponseBody,
  report: Report
): void {
  const named = (name: string) => headers.filter((header) => equalsIgnoringAsciiCase(header.name, name));
  for (const header of headers.filter(({ name }) =>
    UNSTATED_HEADERS.some((each) => equalsIgnoringAsciiCase(each, name))
  )) {
    report(
      at(site, header.name),
      `A stub's response does not state ${header.name}: the server writes Date, Connection and Transfer-Encoding ` +
        'itself, and the rest (Accept, Expect, Host, If-Modified-Since, Proxy-Connection, Range, Referer, ' +
        'User-Agent) are request headers.'
    );
  }
  for (const length of named('Content-Length')) {
    if (body.kind !== 'empty' || status === 204 || status === 205 || (method !== 'HEAD' && status !== 304)) {
      report(
        at(site, length.name),
        'Content-Length is set from the body; a stub states it only on a HEAD or 304 response without a body, ' +
          'and never on a 204 or 205 (RFC 9110 section 8.6).'
      );
    }
    if (!isAllDigits(length.value)) {
      report(at(site, length.name), 'Content-Length is a number of bytes, digits only.');
    }
  }
  for (const type of named('Content-Type')) {
    if (body.kind === 'multipart' && !namesBoundary(type.value, body.boundary)) {
      report(
        at(site, type.name),
        "A client splits a multipart body where its Content-Type's boundary says: state a multipart type with " +
          `boundary=${body.boundary}, or leave Content-Type out to send multipart/form-data; boundary=${body.boundary}.`
      );
    }
    checkCharset(type.value, body, at(site, type.name), report);
  }
}

/** A json or text body, and such a part, is written as UTF-8 whatever its Content-Type says. */
function checkCharset(contentType: string, body: ResponseBody, site: Site, report: Report): void {
  const charset = parseMediaType(contentType)?.parameters.get('charset') ?? '';
  if (
    (body.kind === 'json' || body.kind === 'text') &&
    charset.length > 0 &&
    !equalsIgnoringAsciiCase(charset, 'utf-8')
  ) {
    report(
      site,
      `A json or text body is sent as UTF-8, not as ${charset}: state charset=utf-8 or none, or write the encoded ` +
        'form as a bytes body.'
    );
  }
}

/** A multipart type naming exactly that boundary, quoted or not: `boundary=b-2` does not frame a body cut at `--b`. */
function namesBoundary(contentType: string, boundary: string): boolean {
  const mediaType = parseMediaType(contentType);
  return mediaType?.essence.startsWith('multipart/') === true && mediaType.parameters.get('boundary') === boundary;
}

function parseHeaders(node: JsonValue | undefined, site: Site, report: Report): Header[] {
  const headers = uniqueNames(
    membersOf(node),
    compareIgnoringAsciiCase,
    site,
    'header names are case-insensitive',
    report
  )
    .map(([name, value]) => ({ name, value: requiredText(value, at(site, name)) }))
    .sort((first, second) => compareIgnoringAsciiCase(first.name, second.name));
  for (const header of headers) {
    if (!isToken(header.name)) {
      report(
        at(site, header.name),
        "A header name is an RFC 9110 token: one or more letters, digits or !#$%&'*+-.^_`|~ (no space or ':')."
      );
    }
    if (!isPrintableAscii(header.value)) {
      report(at(site, header.name), 'A header value is printable ASCII; HTTP carries nothing else.');
    }
    if (header.value.length === 0) {
      report(at(site, header.name), 'A stub states no header with an empty value; leave the header out.');
    }
  }
  return headers;
}

/** One entry per name under the comparer; a name given twice is reported and its first entry kept. */
function uniqueNames(
  entries: [string, JsonValue][],
  compare: (first: string, second: string) => number,
  site: Site,
  wording: string,
  report: Report
): [string, JsonValue][] {
  const firsts = entries.filter(
    ([name], index) => entries.findIndex(([other]) => compare(other, name) === 0) === index
  );
  for (const [name] of firsts.filter(([name]) => entries.filter(([other]) => compare(other, name) === 0).length > 1)) {
    report(at(site, name), `'${name}' is named twice (${wording}).`);
  }
  return firsts;
}

function parseResponseBody(node: JsonValue | undefined, site: Site, report: Report): ResponseBody {
  if (node?.kind !== 'object') {
    return { kind: 'empty' };
  }
  const sse = member(node, 'sse');
  if (sse?.kind === 'array') {
    const events = sse.items.map((event, index) => parseEvent(event, at(site, 'sse', index), report));
    return { kind: 'sse', events, chunkDelayMs: DEFAULT_CHUNK_DELAY_MS };
  }
  const ndjson = member(node, 'ndjson');
  if (ndjson?.kind === 'array') {
    return { kind: 'ndjson', lines: ndjson.items.map(writeJson), chunkDelayMs: DEFAULT_CHUNK_DELAY_MS };
  }
  const multipart = member(node, 'multipart');
  return multipart?.kind === 'object'
    ? parseMultipartResponse(multipart, at(site, 'multipart'), report)
    : parseContentResponse(node, site, report);
}

/** The json / text / bytes alternatives shared by response bodies and the parts of a multipart response. */
function parseContentResponse(node: JsonValue, site: Site, report: Report): ContentResponse {
  const json = member(node, 'json');
  if (json !== undefined) {
    return { kind: 'json', json };
  }
  const text = given(node, 'text');
  return text
    ? { kind: 'text', text: requiredText(text, at(site, 'text')) }
    : { kind: 'bytes', bytes: parseBase64(member(node, 'bytes'), at(site, 'bytes'), report) };
}

function parseMultipartResponse(node: JsonValue, site: Site, report: Report): MultipartResponse {
  const partsSite = at(site, 'parts');
  const boundary = textOf(member(node, 'boundary')) ?? DEFAULT_BOUNDARY;
  if (!isValidBoundary(boundary)) {
    report(
      at(site, 'boundary'),
      `A boundary is 1 to 70 characters, each a letter, a digit or one of ${BOUNDARY_PUNCTUATION}, which the ` +
        'Content-Type parameter carries without quotes.'
    );
  }
  const parts = membersOf(member(node, 'parts')).map(([name, part]) =>
    parseResponsePart(name, part, at(partsSite, name), report)
  );
  const response: MultipartResponse = { kind: 'multipart', boundary, parts };
  for (const part of partsContainingTheDelimiter(response)) {
    report(at(partsSite, part.name), `The part contains --${boundary}; a reader would end the part there.`);
  }
  return response;
}

/** A filename makes a file part; the Content-Type is the stated one or the content kind's own, so every part names its media type. */
function parseResponsePart(name: string, part: JsonValue, site: Site, report: Report): ResponsePart {
  const content = parseContentResponse(part, site, report);
  const fileName = given(part, 'filename');
  const contentType = given(part, 'contentType');
  return {
    name: quotable(name, site, report),
    ...optional(
      'fileName',
      fileName && quotable(requiredText(fileName, at(site, 'filename')), at(site, 'filename'), report)
    ),
    contentType: contentType
      ? partContentType(requiredText(contentType, at(site, 'contentType')), content, at(site, 'contentType'), report)
      : mediaTypeOf(content),
    content
  };
}

/** Written as a header line inside the body, so a CR or LF would end that line early and start another header. */
function partContentType(contentType: string, content: ContentResponse, site: Site, report: Report): string {
  if (!isPrintableAscii(contentType)) {
    report(
      site,
      "A part's contentType is printable ASCII, as a header value is; a line break would start another header " +
        'inside the part.'
    );
  }
  checkCharset(contentType, content, site, report);
  return contentType;
}

/** Quoted in the part's Content-Disposition, so only printable ASCII without a double quote comes back as written. */
function quotable(text: string, site: Site, report: Report): string {
  if (!isPrintableAscii(text) || text.includes('"')) {
    report(site, 'A part name or filename is printable ASCII without a double quote; Content-Disposition quotes it.');
  }
  return text;
}

/** String data is sent as written; any other JSON value is written compactly, as a json body is. */
function parseEvent(node: JsonValue, site: Site, report: Report): SseEvent {
  const data = member(node, 'data');
  return {
    ...optional('id', singleLine(textOf(member(node, 'id')), at(site, 'id'), report)),
    ...optional('event', singleLine(textOf(member(node, 'event')), at(site, 'event'), report)),
    ...optional('retry', integerOf(member(node, 'retry'))),
    data: textOf(data) ?? (data === undefined ? 'null' : writeJson(data))
  };
}

/** A line break ends an SSE field, so one in id or event would start whatever follows it as another field. */
function singleLine(text: string | undefined, site: Site, report: Report): string | undefined {
  if (text !== undefined && (text.includes('\r') || text.includes('\n'))) {
    report(site, 'SSE has no escape for a line break in id or event; a CR or LF there would start another field.');
  }
  return text;
}

/** A member that is left out when it has no value, so two stubs read alike compare alike. */
function optional<Key extends string, Value>(key: Key, value: Value | undefined): { [K in Key]?: Value } {
  return value === undefined ? {} : ({ [key]: value } as { [K in Key]: Value });
}
