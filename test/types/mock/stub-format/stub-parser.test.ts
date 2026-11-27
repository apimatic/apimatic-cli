import { expect } from 'chai';
import { errorStub, oauth2Stub, problemsOf, successStub } from '../../../helpers/mock-stubs.js';

const response = (json: string) => successStub({ response: json });
const multipart = (members: string, headers = '') =>
  response(`{ "status": 200${headers}, "body": { "multipart": { ${members} } } }`);
const onePart = '"parts": { "p": { "text": "x" } }';
const credential = (json: string) => successStub({ extraRequest: `"auth": { "anyOf": [ { "key": ${json} } ] }` });

describe('parseStub', () => {
  for (const [title, json, path, fault] of [
    ['an error stub with a status below 400', errorStub({ status: 200 }), '/0/response/status', '400 or more, not 200'],
    [
      'an error stub with a body',
      errorStub({ extraRequest: '"body": { "json": {} }' }),
      '/0/request/body',
      "no 'body'"
    ],
    [
      'an error stub with a query',
      errorStub({ extraRequest: '"query": { "a": "1" }' }),
      '/0/request/query',
      "no 'query'"
    ],
    [
      'an error stub with a query mode',
      errorStub({ extraRequest: '"queryMode": "open"' }),
      '/0/request/queryMode',
      "no 'queryMode'"
    ],
    [
      'base64 that does not decode',
      successStub({ body: '"body": { "bytes": "not base64!" }' }),
      '/0/request/body/bytes',
      'Not valid base64.'
    ],
    [
      'bad base64 in the second of a repeated part',
      successStub({
        body: '"body": { "multipart": { "parts": { "files": [ { "bytes": "" }, { "bytes": "not base64!" } ] } } }'
      }),
      '/0/request/body/multipart/parts/files/1/bytes',
      'base64'
    ],
    [
      'bad base64 in a part named with a slash',
      successStub({ body: '"body": { "multipart": { "parts": { "a/b": { "bytes": "not base64!" } } } }' }),
      '/0/request/body/multipart/parts/a~1b/bytes',
      'base64'
    ],
    [
      'bad base64 in a response',
      response('{ "status": 200, "body": { "bytes": "not base64!" } }'),
      '/0/response/body/bytes',
      'base64'
    ],
    [
      'a request header named twice in two letter cases',
      successStub({ headers: '"X-A": "1", "x-a": "2"' }),
      '/0/request/headers/X-A',
      "'X-A' is named twice (names here are case-insensitive)."
    ],
    [
      'a response header named twice in two letter cases',
      response('{ "status": 200, "headers": { "X-A": "1", "x-a": "2" } }'),
      '/0/response/headers/X-A',
      "'X-A' is named twice (header names are case-insensitive)."
    ],
    ['a path that mixes text and braces', successStub({ path: '/v1/x{id}' }), '/0/request/path', 'whole segment'],
    ['a path with a query string', successStub({ path: '/v1/x?y=1' }), '/0/request/path', 'query'],
    ['a path without its leading slash', successStub({ path: 'relative' }), '/0/request/path', "start with '/'"],
    ['a percent-encoded path', successStub({ path: '/v1/a%20b' }), '/0/request/path', 'percent-encoded'],
    ['a path with an empty segment', successStub({ path: '/v1//accounts' }), '/0/request/path', 'no empty segments'],
    ["a path with the dot segment '..'", successStub({ path: '/a/../b' }), '/0/request/path', "'..' is a dot segment"],
    ["a path with the dot segment '.'", successStub({ path: '/c/./d' }), '/0/request/path', "'.' is a dot segment"],
    [
      'a token path with an empty segment',
      oauth2Stub({ tokenPath: '/oauth2//token' }),
      '/0/oauth2/tokenPath',
      'no empty segments'
    ],
    [
      'a percent-encoded token path',
      oauth2Stub({ tokenPath: '/oauth2%2Ftoken' }),
      '/0/oauth2/tokenPath',
      'percent-encoded'
    ],
    [
      'a token path with a parameter',
      oauth2Stub({ tokenPath: '/oauth2/{tenant}/token' }),
      '/0/oauth2/tokenPath',
      'An OAuth2 endpoint path is literal'
    ],
    [
      'an authorize path with a parameter',
      oauth2Stub({ flows: '"authorizationCode": { "authorizePath": "/oauth2/{tenant}/authorize" }' }),
      '/0/oauth2/flows/authorizationCode/authorizePath',
      'literal'
    ],
    [
      'an authorize path that is the token path',
      oauth2Stub({ flows: '"implicit": { "authorizePath": "/oauth2/token" }' }),
      '/0/oauth2/flows/implicit/authorizePath',
      'The authorize path is the token path'
    ],
    ['an example on an oauth2 stub', oauth2Stub({ extraStub: '"example": "x"' }), '/0/example', "no 'example'"],
    [
      'a chunk delay on a json body',
      response('{ "status": 200, "body": { "json": {} }, "chunkDelayMs": 5 }'),
      '/0/response/chunkDelayMs',
      'sse and ndjson'
    ],
    [
      'a chunk delay on a multipart body',
      response(`{ "status": 200, "body": { "multipart": { ${onePart} } }, "chunkDelayMs": 5 }`),
      '/0/response/chunkDelayMs',
      'sse and ndjson'
    ],
    [
      'a chunk delay without a body',
      response('{ "status": 200, "chunkDelayMs": 5 }'),
      '/0/response/chunkDelayMs',
      'sse and ndjson'
    ],
    [
      'a json body on a 204',
      response('{ "status": 204, "body": { "json": {} } }'),
      '/0/response/body',
      'A 204 response cannot carry a body (RFC 9110 section 15.3.5).'
    ],
    [
      'a JSON null body on a 204',
      response('{ "status": 204, "body": { "json": null } }'),
      '/0/response/body',
      'A 204 response cannot carry a body'
    ],
    [
      'an empty text body on a 205',
      response('{ "status": 205, "body": { "text": "" } }'),
      '/0/response/body',
      'A 205 response cannot carry a body (RFC 9110 section 15.3.6).'
    ],
    [
      'a bytes body on a 304',
      response('{ "status": 304, "body": { "bytes": "AA==" } }'),
      '/0/response/body',
      'A 304 response cannot carry a body (RFC 9110 section 15.4.5).'
    ],
    [
      'an sse body on a 204',
      response('{ "status": 204, "body": { "sse": [ { "data": "x" } ] } }'),
      '/0/response/body',
      'A 204 response cannot carry a body'
    ],
    [
      'an ndjson body on a 205',
      response('{ "status": 205, "body": { "ndjson": [ {} ] } }'),
      '/0/response/body',
      'A 205 response cannot carry a body'
    ],
    [
      'a multipart body on a 304',
      response(`{ "status": 304, "body": { "multipart": { ${onePart} } } }`),
      '/0/response/body',
      'A 304 response cannot carry a body'
    ],
    [
      "a body on a named example's 204",
      successStub({ extraStub: '"example": "gone"', response: '{ "status": 204, "body": { "json": {} } }' }),
      '/0/response/body',
      'A 204 response cannot carry a body'
    ],
    [
      "a body on an error stub's 304",
      errorStub({ status: 304, extraResponse: '"body": { "json": {} }' }),
      '/0/response/body',
      'A 304 response cannot carry a body'
    ],
    [
      'a multipart boundary with a space',
      multipart(`"boundary": "a b", ${onePart}`),
      '/0/response/body/multipart/boundary',
      '1 to 70'
    ],
    [
      "a multipart boundary with '='",
      multipart(`"boundary": "a=b", ${onePart}`),
      '/0/response/body/multipart/boundary',
      'carries without quotes'
    ],
    [
      'the multipart delimiter inside a part',
      multipart('"boundary": "b1", "parts": { "p": { "text": "--b1--" } }'),
      '/0/response/body/multipart/parts/p',
      'The part contains --b1; a reader would end the part there.'
    ],
    [
      'a multipart Content-Type without the boundary',
      multipart(onePart, ', "headers": { "Content-Type": "multipart/form-data" }'),
      '/0/response/headers/Content-Type',
      'with boundary=mockserver-boundary,'
    ],
    [
      'a multipart Content-Type naming another boundary',
      multipart(
        `"boundary": "xyz", ${onePart}`,
        ', "headers": { "content-type": "multipart/form-data; boundary=abc" }'
      ),
      '/0/response/headers/content-type',
      'with boundary=xyz,'
    ],
    [
      'a multipart Content-Type naming a longer boundary',
      multipart(onePart, ', "headers": { "Content-Type": "multipart/form-data; boundary=mockserver-boundary-2" }'),
      '/0/response/headers/Content-Type',
      'with boundary=mockserver-boundary,'
    ],
    [
      'a multipart Content-Type naming the boundary in another letter case',
      multipart(onePart, ', "headers": { "Content-Type": "multipart/form-data; boundary=MOCKSERVER-BOUNDARY" }'),
      '/0/response/headers/Content-Type',
      'with boundary=mockserver-boundary,'
    ],
    [
      'a JSON Content-Type on a multipart body',
      multipart(onePart, ', "headers": { "Content-Type": "application/json; boundary=mockserver-boundary" }'),
      '/0/response/headers/Content-Type',
      'state a multipart type'
    ],
    [
      'a Content-Type that is no media type on a multipart body',
      multipart(onePart, ', "headers": { "Content-Type": "multipart; boundary=mockserver-boundary" }'),
      '/0/response/headers/Content-Type',
      'state a multipart type'
    ],
    [
      'a part filename with a double quote',
      multipart('"parts": { "p": { "filename": "a\\"b", "bytes": "" } }'),
      '/0/response/body/multipart/parts/p/filename',
      'double quote'
    ],
    [
      'a part name with a double quote',
      multipart('"parts": { "p\\"q": { "text": "x" } }'),
      '/0/response/body/multipart/parts/p"q',
      'double quote'
    ],
    [
      'a part name with a line break',
      multipart('"parts": { "p\\r\\nX-Injected: 1": { "text": "x" } }'),
      '/0/response/body/multipart/parts/p\r\nX-Injected: 1',
      'printable ASCII'
    ],
    [
      'a part filename outside ASCII',
      multipart('"parts": { "p": { "filename": "café.txt", "bytes": "" } }'),
      '/0/response/body/multipart/parts/p/filename',
      'printable ASCII'
    ],
    [
      "a line break in a part's contentType",
      multipart('"parts": { "p": { "contentType": "text/plain\\r\\nX-Injected: 1", "text": "hi" } }'),
      '/0/response/body/multipart/parts/p/contentType',
      'printable ASCII, as a header value is'
    ],
    [
      "a part's contentType outside ASCII",
      multipart('"parts": { "p": { "contentType": "tëxt/plain", "text": "hi" } }'),
      '/0/response/body/multipart/parts/p/contentType',
      'printable ASCII, as a header value is'
    ],
    [
      'a text part under another charset',
      multipart('"parts": { "p": { "contentType": "text/plain; charset=iso-8859-1", "text": "héllo" } }'),
      '/0/response/body/multipart/parts/p/contentType',
      'sent as UTF-8, not as iso-8859-1'
    ],
    [
      'a text body under another charset',
      response(
        '{ "status": 200, "headers": { "Content-Type": "text/plain; charset=iso-8859-1" }, "body": { "text": "héllo" } }'
      ),
      '/0/response/headers/Content-Type',
      'sent as UTF-8, not as iso-8859-1'
    ],
    [
      'a json body under a quoted charset',
      response(
        '{ "status": 200, "headers": { "content-type": "application/json; charset=\\"utf-16\\"" }, "body": { "json": {} } }'
      ),
      '/0/response/headers/content-type',
      'sent as UTF-8, not as utf-16'
    ],
    [
      'a response header value outside ASCII',
      response('{ "status": 200, "headers": { "X-Note": "café" } }'),
      '/0/response/headers/X-Note',
      'A header value is printable ASCII'
    ],
    [
      'a response header name outside ASCII',
      response('{ "status": 200, "headers": { "X-Nöte": "ok" } }'),
      '/0/response/headers/X-Nöte',
      'RFC 9110 token'
    ],
    [
      'a response header name with a space',
      response('{ "status": 200, "headers": { "Retry After": "1" } }'),
      '/0/response/headers/Retry After',
      'RFC 9110 token'
    ],
    [
      'a response header name with a colon',
      response('{ "status": 200, "headers": { "X:Note": "ok" } }'),
      '/0/response/headers/X:Note',
      'RFC 9110 token'
    ],
    [
      'a response header name with a parenthesis',
      response('{ "status": 200, "headers": { "X(Note)": "ok" } }'),
      '/0/response/headers/X(Note)',
      'RFC 9110 token'
    ],
    [
      'an empty response header name',
      response('{ "status": 200, "headers": { "": "ok" } }'),
      '/0/response/headers/',
      'RFC 9110 token'
    ],
    [
      'a value outside ASCII under a header named with a tilde, which the pointer escapes',
      response('{ "status": 200, "headers": { "X~Note": "café" } }'),
      '/0/response/headers/X~0Note',
      'printable ASCII'
    ],
    [
      'an empty response header value',
      response('{ "status": 200, "headers": { "X-Next-Cursor": "" } }'),
      '/0/response/headers/X-Next-Cursor',
      'no header with an empty value'
    ],
    [
      'a transfer-encoding response header in lower case',
      response('{ "status": 200, "headers": { "transfer-encoding": "chunked" } }'),
      '/0/response/headers/transfer-encoding',
      'does not state transfer-encoding'
    ],
    [
      'a Date header on an error stub',
      errorStub({ extraResponse: '"headers": { "Date": "Tue, 15 Nov 1994 08:12:31 GMT" }' }),
      '/0/response/headers/Date',
      'does not state Date'
    ],
    [
      'a Content-Length on a GET with a body',
      response('{ "status": 200, "headers": { "Content-Length": "11" }, "body": { "text": "hello world" } }'),
      '/0/response/headers/Content-Length',
      'only on a HEAD or 304 response without a body'
    ],
    [
      'a Content-Length on a GET without a body',
      response('{ "status": 200, "headers": { "Content-Length": "10" } }'),
      '/0/response/headers/Content-Length',
      'only on a HEAD or 304 response without a body'
    ],
    [
      'a Content-Length on a HEAD with a body',
      successStub({
        method: 'HEAD',
        response: '{ "status": 200, "headers": { "Content-Length": "2" }, "body": { "text": "hi" } }'
      }),
      '/0/response/headers/Content-Length',
      'only on a HEAD or 304 response without a body'
    ],
    [
      'a Content-Length on a 204',
      response('{ "status": 204, "headers": { "content-length": "0" } }'),
      '/0/response/headers/content-length',
      'only on a HEAD or 304 response without a body'
    ],
    [
      'a Content-Length on a HEAD 204',
      successStub({ method: 'HEAD', response: '{ "status": 204, "headers": { "Content-Length": "5" } }' }),
      '/0/response/headers/Content-Length',
      'never on a 204 or 205'
    ],
    [
      'a Content-Length on a HEAD 205',
      successStub({ method: 'HEAD', response: '{ "status": 205, "headers": { "Content-Length": "5" } }' }),
      '/0/response/headers/Content-Length',
      'never on a 204 or 205'
    ],
    [
      'a Content-Length that is not a number',
      successStub({ method: 'HEAD', response: '{ "status": 200, "headers": { "Content-Length": "ten" } }' }),
      '/0/response/headers/Content-Length',
      'Content-Length is a number of bytes, digits only.'
    ],
    [
      'a line break in an SSE id',
      response('{ "status": 200, "body": { "sse": [ { "id": "1\\nevent: injected", "data": "x" } ] } }'),
      '/0/response/body/sse/0/id',
      'no escape for a line break'
    ],
    [
      'a carriage return in an SSE event',
      response('{ "status": 200, "body": { "sse": [ { "data": "x" }, { "event": "x\\revent: y", "data": "x" } ] } }'),
      '/0/response/body/sse/1/event',
      'no escape for a line break'
    ],
    [
      'an oauth2 scope with a space',
      oauth2Stub({ settings: '"scopes": ["read data"]' }),
      '/0/oauth2/scopes/0',
      'scope-token'
    ],
    [
      'an oauth2 scope with a backslash',
      oauth2Stub({ settings: '"scopes": ["read", "a\\\\b"]' }),
      '/0/oauth2/scopes/1',
      'scope-token'
    ],
    [
      'an oauth2 scope with a double quote',
      oauth2Stub({ settings: '"scopes": ["a\\"b"]' }),
      '/0/oauth2/scopes/0',
      'scope-token'
    ],
    [
      "an oauth2 scope with DEL, the character after '~'",
      oauth2Stub({ settings: '"scopes": ["x\\u007fy"]' }),
      '/0/oauth2/scopes/0',
      'scope-token'
    ],
    [
      'an oauth2 scope outside ASCII',
      oauth2Stub({ settings: '"scopes": ["café"]' }),
      '/0/oauth2/scopes/0',
      'scope-token'
    ],
    [
      'a dateTime that is none',
      successStub({ headers: '"X-When": { "dateTime": "soon" }' }),
      '/0/request/headers/X-When/dateTime',
      "'soon' is not a date-time"
    ],
    [
      'a dateTime that is a date alone',
      successStub({ headers: '"X-When": { "dateTime": "2026-01-15" }' }),
      '/0/request/headers/X-When/dateTime',
      'not a date-time'
    ],
    [
      'a dateTime that is none inside an array',
      successStub({ extraRequest: '"query": { "at": [ "2026-01-15", { "dateTime": "2026-01-15" } ] }' }),
      '/0/request/query/at/1/dateTime',
      'not a date-time'
    ],
    [
      'a $dateTime that is none',
      successStub({ body: '"body": { "json": { "at": { "$dateTime": "soon" } } }' }),
      '/0/request/body/json/at/$dateTime',
      'not a date-time'
    ],
    [
      'a $ rule that is none',
      successStub({ body: '"body": { "json": { "k": { "$startswith": "a" } } }' }),
      '/0/request/body/json/k/$startswith',
      'not a rule'
    ],
    [
      '$any that is not true',
      successStub({ body: '"body": { "json": { "k": { "$any": false } } }' }),
      '/0/request/body/json/k/$any',
      'takes true'
    ],
    [
      'an empty $startsWith',
      successStub({ body: '"body": { "json": { "k": { "$startsWith": "" } } }' }),
      '/0/request/body/json/k/$startsWith',
      'non-empty string'
    ],
    [
      'a $ rule spelled wrong inside an array',
      successStub({ body: '"body": { "json": { "items": [ 1, { "$contains": 2 } ] } }' }),
      '/0/request/body/json/items/1/$contains',
      'non-empty string'
    ],
    [
      'a $ rule spelled wrong at the root of a body',
      successStub({ body: '"body": { "json": { "$anything": true } }' }),
      '/0/request/body/json/$anything',
      'not a rule'
    ],
    [
      'a $dateTime that is none inside a multipart part',
      successStub({
        body: '"body": { "multipart": { "parts": { "m": { "json": { "at": { "$dateTime": "soon" } } } } } }'
      }),
      '/0/request/body/multipart/parts/m/json/at/$dateTime',
      'not a date-time'
    ],
    [
      'an example name with a comma',
      successStub({ extraStub: '"example": "not found, generic"' }),
      '/0/example',
      'no request could ask for this example'
    ],
    [
      'an example name with a semicolon',
      successStub({ extraStub: '"example": "a;b"' }),
      '/0/example',
      'no request could ask for this example'
    ],
    [
      'an example name with a double quote',
      successStub({ extraStub: '"example": "q\\"uote"' }),
      '/0/example',
      'no request could ask for this example'
    ],
    [
      "an error stub's example name with a comma",
      errorStub({ extraStub: '"example": "x,y"' }),
      '/0/example',
      'no request could ask for this example'
    ],
    [
      'a request header value outside ASCII',
      successStub({ headers: '"X-Who": "Zoë"' }),
      '/0/request/headers/X-Who',
      'header or cookie value is printable ASCII'
    ],
    [
      'a request header prefix outside ASCII',
      successStub({ headers: '"X-Who": { "startsWith": "Zoë" }' }),
      '/0/request/headers/X-Who',
      'header or cookie value is printable ASCII'
    ],
    [
      'a request header name with a space',
      successStub({ headers: '"X Name": "v"' }),
      '/0/request/headers/X Name',
      'header or cookie name is an RFC 9110 token'
    ],
    [
      'a cookie value outside ASCII',
      successStub({ extraRequest: '"cookies": { "who": "Zoë" }' }),
      '/0/request/cookies/who',
      'header or cookie value is printable ASCII'
    ],
    [
      'a cookie name with a space',
      successStub({ extraRequest: '"cookies": { "a b": "v" }' }),
      '/0/request/cookies/a b',
      'header or cookie name is an RFC 9110 token'
    ],
    [
      'a header credential outside ASCII',
      credential('{ "in": "header", "name": "X-API-Key", "value": "clé" }'),
      '/0/request/auth/anyOf/0/key',
      'header or cookie value is printable ASCII'
    ],
    [
      'a cookie credential outside ASCII',
      credential('{ "in": "cookie", "name": "session", "startsWith": "clé" }'),
      '/0/request/auth/anyOf/0/key',
      'header or cookie value is printable ASCII'
    ],
    [
      'a header credential named with a space',
      credential('{ "in": "header", "name": "X Key", "value": "k" }'),
      '/0/request/auth/anyOf/0/key',
      'header or cookie name is an RFC 9110 token'
    ],
    [
      'a header rule outside ASCII on an error stub',
      errorStub({ extraRequest: '"headers": { "X-Who": "Zoë" }' }),
      '/0/request/headers/X-Who',
      'header or cookie value is printable ASCII'
    ]
  ]) {
    it(`reports ${title} at its place`, () => {
      const problems = problemsOf({ 'rules.json': json });

      expect(problems.map((problem) => problem.path)).to.include(path);
      expect(problems.find((problem) => problem.path === path)?.message).to.include(fault);
    });
  }
});
