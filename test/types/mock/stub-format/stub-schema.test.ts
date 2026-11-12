import { expect } from 'chai';
import { readJson } from '../../../../src/types/mock/json/json-reader.js';
import { problemLine } from '../../../../src/types/mock/stub-format/stub-problem.js';
import { StubSchema } from '../../../../src/types/mock/stub-format/stub-schema.js';
import { oauth2Stub, stubSchema, successStub } from '../../../helpers/mock-stubs.js';

const problems = (json: string) => stubSchema.problems(readJson(json)._unsafeUnwrap(), 'x.json');
const lines = (json: string) => problems(json).map(problemLine);

/** A success stub named `x`: `request` is more members of its request, `response` the whole response. */
const stub = (request = '', response = '{ "status": 200 }') =>
  successStub({ name: 'x', path: '/', extraRequest: request, response });
const oauth2 = (settings: string) => `[ { "name": "x", "kind": "oauth2", "oauth2": ${settings} } ]`;
const server = (members: string) => oauth2(`{ "tokenPath": "/t", ${members}, "clientId": "c", "clientSecret": "s" }`);
const multipart = (members: string) => stub('', `{ "status": 200, "body": { "multipart": { ${members} } } }`);

const KIND_RULE =
  "A stub of kind 'oauth2' has only 'oauth2'; any other kind has 'request' and 'response' and no 'oauth2'.";
const ONE_CREDENTIAL_RULE = "Give only one of 'value', 'startsWith', 'endsWith', 'contains' and 'dateTime'";

describe('StubSchema', () => {
  for (const [title, json, line] of [
    ['a file that is no array', '{ "name": "x" }', 'x.json: Expected an array, found an object.'],
    ['a stub that is null', '[null]', 'x.json /0: Expected an object, found null.'],
    ['a stub that is a number', '[5]', 'x.json /0: Expected an object, found the number 5.'],
    [
      'an oauth2 stub with a request',
      `[ { "name": "x", "kind": "oauth2", "oauth2": { "tokenPath": "/t", "flows": { "clientCredentials": {} }, "clientId": "c", "clientSecret": "s" }, "request": { "method": "GET", "path": "/" } } ]`,
      `x.json [x] /0: ${KIND_RULE}`
    ],
    [
      'an endpoint stub with oauth2 settings',
      `[ { "name": "x", "operation": "o", "request": { "method": "GET", "path": "/" }, "response": { "status": 200 }, "oauth2": { "tokenPath": "/t", "flows": { "clientCredentials": {} }, "clientId": "c", "clientSecret": "s" } } ]`,
      `x.json [x] /0: ${KIND_RULE}`
    ],
    [
      'an oauth2 stub without its settings',
      '[ { "name": "x", "kind": "oauth2" } ]',
      "x.json [x] /0: 'oauth2' is required here."
    ],
    [
      'a stub without a response, and no more than that',
      '[ { "name": "x", "operation": "o", "request": { "method": "GET", "path": "/" } } ]',
      "x.json [x] /0: 'response' is required here."
    ],
    [
      'an empty list of credential sets',
      stub('"auth": { "anyOf": [] }'),
      'x.json [x] /0/request/auth/anyOf: Must not be empty.'
    ],
    [
      'an empty credential set',
      stub('"auth": { "anyOf": [ {} ] }'),
      'x.json [x] /0/request/auth/anyOf/0: Must not be empty.'
    ],
    [
      'a credential with two rules',
      stub('"auth": { "anyOf": [ { "s": { "in": "header", "name": "A", "value": "v", "startsWith": "p" } } ] }'),
      `x.json [x] /0/request/auth/anyOf/0/s: ${ONE_CREDENTIAL_RULE}; this has 'value' and 'startsWith'.`
    ],
    [
      'a credential with a value and a date-time',
      stub(
        '"auth": { "anyOf": [ { "s": { "in": "header", "name": "A", "value": "v", "dateTime": "2026-01-01T00:00:00Z" } } ] }'
      ),
      `x.json [x] /0/request/auth/anyOf/0/s: ${ONE_CREDENTIAL_RULE}; this has 'value' and 'dateTime'.`
    ],
    [
      'a credential without a rule',
      stub('"auth": { "anyOf": [ { "s": { "in": "header", "name": "A" } } ] }'),
      "x.json [x] /0/request/auth/anyOf/0/s: Give one of 'value', 'startsWith', 'endsWith', 'contains' or 'dateTime'."
    ],
    [
      'a request body of two kinds',
      stub('"body": { "json": {}, "text": "" }'),
      "x.json [x] /0/request/body/text: 'text' is not a known property here."
    ],
    [
      'a form beside another body kind',
      stub('"body": { "form": {}, "json": {} }'),
      "x.json [x] /0/request/body/form: 'form' is not a known property here."
    ],
    [
      'a form field that is a number',
      stub('"body": { "form": { "a": 1 } }'),
      'x.json [x] /0/request/body/form/a: Expected a string, found the number 1.'
    ],
    [
      'a header rule that is both a prefix and absent',
      stub('"headers": { "H": { "startsWith": "a", "absent": true } }'),
      "x.json [x] /0/request/headers/H/startsWith: 'startsWith' is not a known property here."
    ],
    [
      'a header rule that is both a date-time and a prefix',
      stub('"headers": { "H": { "dateTime": "x", "startsWith": "a" } }'),
      "x.json [x] /0/request/headers/H/startsWith: 'startsWith' is not a known property here."
    ],
    [
      'a header rule with two text rules, named as the choice it is rather than as a type',
      stub('"headers": { "X": { "startsWith": "a", "endsWith": "b" } }'),
      "x.json [x] /0/request/headers/X: Give only one of 'startsWith', 'endsWith' and 'contains'; this has 'startsWith' and 'endsWith'."
    ],
    [
      'a header sent more than once, which only a query key or a form field can be',
      stub('"headers": { "H": ["a", "b"] }'),
      'x.json [x] /0/request/headers/H: Expected a string, found an array.'
    ],
    [
      'a header that is a boolean',
      stub('"headers": { "X-Flag": true }'),
      'x.json [x] /0/request/headers/X-Flag: Expected a string, found a boolean.'
    ],
    [
      'a text rule that is a number, as the closest branch alone',
      stub('"headers": { "X": { "startsWith": 5 } }'),
      'x.json [x] /0/request/headers/X/startsWith: Expected a string, found the number 5.'
    ],
    [
      'an empty date-time',
      stub('"headers": { "H": { "dateTime": "" } }'),
      'x.json [x] /0/request/headers/H/dateTime: Must not be empty.'
    ],
    [
      'a query value that is a number',
      stub('"query": { "limit": 2 }'),
      'x.json [x] /0/request/query/limit: Expected a string, found the number 2.'
    ],
    [
      'a null among repeated query values',
      stub('"query": { "q": [ null ] }'),
      'x.json [x] /0/request/query/q/0: Expected a string, found null.'
    ],
    [
      'a repeated part without parts',
      stub('"body": { "multipart": { "parts": { "p": [] } } }'),
      'x.json [x] /0/request/body/multipart/parts/p: Must not be empty.'
    ],
    [
      'an empty part filename',
      stub('"body": { "multipart": { "parts": { "p": { "filename": "", "bytes": "" } } } }'),
      'x.json [x] /0/request/body/multipart/parts/p/filename: Must not be empty.'
    ],
    [
      'an unknown response property, without the kind rule',
      stub('', '{ "status": 200, "colour": "red" }'),
      "x.json [x] /0/response/colour: 'colour' is not a known property here."
    ],
    [
      'an SSE event without data',
      stub('', '{ "status": 200, "body": { "sse": [ { "id": "1" } ] } }'),
      "x.json [x] /0/response/body/sse/0: 'data' is required here."
    ],
    [
      'a response body of two kinds',
      stub('', '{ "status": 200, "body": { "json": {}, "text": "" } }'),
      "x.json [x] /0/response/body/text: 'text' is not a known property here."
    ],
    [
      'a multipart response beside another body kind',
      stub('', '{ "status": 200, "body": { "multipart": { "parts": { "p": { "text": "" } } }, "json": {} } }'),
      "x.json [x] /0/response/body/multipart: 'multipart' is not a known property here."
    ],
    [
      'a multipart response without parts',
      multipart('"parts": {}'),
      'x.json [x] /0/response/body/multipart/parts: Must not be empty.'
    ],
    [
      'a response part of two kinds',
      multipart('"parts": { "p": { "json": {}, "text": "" } }'),
      "x.json [x] /0/response/body/multipart/parts/p: Give only one of 'json', 'text' and 'bytes'; this has 'json' and 'text'."
    ],
    [
      'a response part without content',
      multipart('"parts": { "p": { "filename": "f" } }'),
      "x.json [x] /0/response/body/multipart/parts/p: Give one of 'json', 'text' or 'bytes'."
    ],
    [
      'a response part with headers of its own',
      multipart('"parts": { "p": { "text": "", "headers": {} } }'),
      "x.json [x] /0/response/body/multipart/parts/p/headers: 'headers' is not a known property here."
    ],
    [
      'an empty boundary',
      multipart('"boundary": "", "parts": { "p": { "text": "" } }'),
      'x.json [x] /0/response/body/multipart/boundary: Must not be empty.'
    ],
    [
      'a status below 200',
      stub('', '{ "status": 99 }'),
      'x.json [x] /0/response/status: Must be at least 200, not 99.'
    ],
    [
      'an interim status, and nothing about the stream it could not carry',
      stub('', '{ "status": 100, "body": { "sse": [ { "data": "x" } ] } }'),
      'x.json [x] /0/response/status: Must be at least 200, not 100.'
    ],
    [
      'a status with a fraction',
      stub('', '{ "status": 200.5 }'),
      'x.json [x] /0/response/status: Expected a whole number, found the number 200.5.'
    ],
    [
      'a status in quotes',
      stub('', '{ "status": "200" }'),
      'x.json [x] /0/response/status: Expected a whole number, found a string.'
    ],
    [
      'a chunk delay beyond 32 bits',
      stub('', '{ "status": 200, "body": { "ndjson": [ {} ] }, "chunkDelayMs": 3000000000 }'),
      'x.json [x] /0/response/chunkDelayMs: Must be at most 2147483647, not 3000000000.'
    ],
    [
      'an SSE retry beyond 32 bits',
      stub('', '{ "status": 200, "body": { "sse": [ { "data": "x", "retry": 2147483648 } ] } }'),
      'x.json [x] /0/response/body/sse/0/retry: Must be at most 2147483647, not 2147483648.'
    ],
    [
      'a token lifetime beyond 32 bits',
      oauth2Stub({ name: 'x', settings: '"expiresIn": 2147483648' }),
      'x.json [x] /0/oauth2/expiresIn: Must be at most 2147483647, not 2147483648.'
    ],
    [
      'an empty example name',
      successStub({ name: 'x', extraStub: '"example": ""' }),
      'x.json [x] /0/example: Must not be empty.'
    ],
    [
      'an oauth2 server without flows',
      oauth2('{ "tokenPath": "/t", "clientId": "c", "clientSecret": "s" }'),
      "x.json [x] /0/oauth2: 'flows' is required here."
    ],
    ['an oauth2 server with no flow', server('"flows": {}'), 'x.json [x] /0/oauth2/flows: Must not be empty.'],
    [
      'an authorization-code flow without its authorize path',
      server('"flows": { "authorizationCode": {} }'),
      "x.json [x] /0/oauth2/flows/authorizationCode: 'authorizePath' is required here."
    ],
    [
      'an implicit flow without its authorize path',
      server('"flows": { "implicit": {} }'),
      "x.json [x] /0/oauth2/flows/implicit: 'authorizePath' is required here."
    ],
    [
      'a flow OAuth2 does not have here',
      server('"flows": { "deviceCode": {} }'),
      "x.json [x] /0/oauth2/flows/deviceCode: 'deviceCode' is not a known property here."
    ],
    [
      'a token under a name the flow does not use',
      server('"flows": { "clientCredentials": { "token": "t" } }'),
      "x.json [x] /0/oauth2/flows/clientCredentials/token: 'token' is not a known property here."
    ],
    [
      'an authorize path outside its flow',
      server('"authorizePath": "/a", "flows": { "clientCredentials": {} }'),
      "x.json [x] /0/oauth2/authorizePath: 'authorizePath' is not a known property here."
    ],
    [
      'an empty scope',
      server('"flows": { "clientCredentials": {} }, "scopes": ["read", ""]'),
      'x.json [x] /0/oauth2/scopes/1: Must not be empty.'
    ]
  ]) {
    it(`reports ${title}`, () => {
      const reported = lines(json);

      expect(reported).to.deep.equal([line]);
    });
  }

  it('names a misspelt text rule as the unknown key it is, beside the rules it could have been', () => {
    const json = stub('"headers": { "X": { "startWith": "a" } }');

    const reported = lines(json);

    expect(reported).to.deep.equal([
      "x.json [x] /0/request/headers/X: Give one of 'startsWith', 'endsWith' or 'contains'.",
      "x.json [x] /0/request/headers/X/startWith: 'startWith' is not a known property here."
    ]);
  });

  it('names a misspelt body kind as the unknown key it is', () => {
    const json = stub('"body": { "jsno": {} }');

    const reported = lines(json);

    expect(reported).to.include("x.json [x] /0/request/body/jsno: 'jsno' is not a known property here.");
  });

  it('reports each stub at its own pointer, with its name once it has one', () => {
    const json = `[
      { "operation": "x", "request": { "method": "FETCH", "path": "/v1" }, "response": { "status": 200 } },
      { "name": "two", "operation": "x", "request": { "method": "GET", "path": "/v1", "colour": 1 }, "response": { "status": 200 } }
    ]`;

    const reported = lines(json);

    expect(reported).to.deep.equal([
      "x.json /0: 'name' is required here.",
      'x.json /0/request/method: Must be one of GET, POST, PUT, PATCH, DELETE, HEAD or OPTIONS.',
      "x.json [two] /1/request/colour: 'colour' is not a known property here."
    ]);
  });

  it('escapes a key that holds a slash or a tilde in the pointer, as RFC 6901 says', () => {
    const json = stub('"body": { "multipart": { "parts": { "a/b~c": { "colour": 1, "text": "" } } } }');

    const reported = problems(json).map((problem) => problem.path);

    expect(reported).to.deep.equal(['/0/request/body/multipart/parts/a~1b~0c/colour']);
  });

  it('finds nothing wrong with a stub of each kind', () => {
    const files = [stub(), successStub({ extraStub: '"kind": "error"' }), oauth2Stub()];

    const reported = files.flatMap(lines);

    expect(reported).to.deep.equal([]);
  });

  it('refuses a schema with a keyword it has no message for, rather than checking the rule unexplained', () => {
    const document = { type: 'array', items: { type: 'object', patternProperties: { '^x-': {} }, uniqueItems: true } };

    const read = StubSchema.read(document);

    expect(read._unsafeUnwrapErr()).to.equal(
      "The stub schema uses 'patternProperties' and 'uniqueItems', which the loader cannot explain."
    );
  });

  it('refuses a schema that is no schema at all', () => {
    const read = StubSchema.read(['not', 'a', 'schema']);

    expect(read._unsafeUnwrapErr()).to.equal('The stub schema is not a JSON object.');
  });
});
