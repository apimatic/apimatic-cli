import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { err } from 'neverthrow';
import { writeJson } from '../../../../src/types/mock/json/json-writer.js';
import { Instant } from '../../../../src/types/mock/stub-format/instant.js';
import { pathsOf } from '../../../../src/types/mock/stub-format/oauth2-settings.js';
import { isStubFileName, loadStubs } from '../../../../src/types/mock/stub-format/stub-loader.js';
import { problemLine } from '../../../../src/types/mock/stub-format/stub-problem.js';
import { chunksOf } from '../../../../src/types/mock/stub-format/stub-response.js';
import { ValueRule } from '../../../../src/types/mock/stub-format/value-rule.js';
import {
  errorStub,
  fixtureStubs,
  memberOf,
  oauth2Stub,
  problemsOf,
  ruleNamed,
  sampleError,
  sampleOAuth2,
  sampleStubs,
  sampleSuccess,
  stubSchema,
  stubsOf,
  successStub
} from '../../../helpers/mock-stubs.js';

const STATEMENT_PDF = Buffer.from('%PDF-1.7\n');
const exact = (value: string): ValueRule => ({ kind: 'exact', value });
const instant = (text: string): ValueRule => ({ kind: 'dateTime', instant: Instant.parse(text) as Instant });
const newYear = instant('2026-01-01T00:00:00Z');
const located = (files: Record<string, string>) =>
  problemsOf(files).map((problem) => `${problem.file} ${problem.path}`.trimEnd());
const onlySuccess = (json: string) => {
  const [stub] = stubsOf({ 's.json': json }).endpoints;
  if (stub.kind !== 'success') {
    throw new Error('The file holds no success stub.');
  }
  return stub;
};

describe('loadStubs, reading the sample set', () => {
  it('loads every file in name order', () => {
    const stubs = sampleStubs();

    const files = [...new Set(stubs.all.map((stub) => stub.file))];

    expect(files).to.deep.equal([
      'accounts.json',
      'bodies.json',
      'examples.json',
      'files.json',
      'oauth2.json',
      'partner-oauth2.json',
      'streams.json'
    ]);
    expect([stubs.all.length, stubs.endpoints.length, stubs.oauth2Servers.length]).to.deep.equal([20, 18, 2]);
  });

  it('reads every field of a success stub', () => {
    const stub = sampleSuccess('listAccounts 200 page 2');

    const read = {
      operation: stub.operation,
      file: stub.file,
      method: stub.route.method,
      path: stub.route.path.toString(),
      literal: stub.route.path.isLiteral(),
      queryMode: stub.query.mode,
      offset: ruleNamed(stub.query.rules, 'offset'),
      tags: ruleNamed(stub.query.rules, 'tags'),
      cursor: ruleNamed(stub.query.rules, 'cursor'),
      limit: ruleNamed(stub.query.rules, 'limit'),
      accept: ruleNamed(stub.route.headers, 'Accept'),
      cookies: stub.route.cookies,
      body: stub.body,
      status: stub.response.status,
      headers: stub.response.headers
    };

    expect(read).to.deep.equal({
      operation: 'listAccounts',
      file: 'accounts.json',
      method: 'GET',
      path: '/v1/accounts',
      literal: true,
      queryMode: 'closed',
      offset: exact('1'),
      tags: { kind: 'each', rules: [exact('rent'), exact('shared')] },
      cursor: { kind: 'startsWith', prefix: 'cur_' },
      limit: { kind: 'absent' },
      accept: { kind: 'startsWith', prefix: 'application/json' },
      cookies: [],
      body: { kind: 'none' },
      status: 200,
      headers: [{ name: 'Content-Type', value: 'application/json' }]
    });
  });

  it('reads credentials as an OR of ANDs', () => {
    const stub = sampleSuccess('listAccounts 200 page 2');

    const auth = stub.route.auth.anyOf;

    expect(auth.map((set) => set.map((credential) => credential.scheme))).to.deep.equal([
      ['bearerAuth'],
      ['apiKeyHeader', 'basicAuth']
    ]);
    expect(auth[1][0]).to.deep.equal({
      scheme: 'apiKeyHeader',
      in: 'header',
      name: 'X-API-Key',
      rule: exact('test-api-key')
    });
  });

  it('reads headers, cookies and a JSON body', () => {
    const stub = sampleSuccess('createAccount 201');

    const read = {
      method: stub.route.method,
      idempotencyKey: ruleNamed(stub.route.headers, 'Idempotency-Key'),
      prefer: ruleNamed(stub.route.headers, 'Prefer'),
      session: ruleNamed(stub.route.cookies, 'ledger_session'),
      creditLimit: stub.body.kind === 'json' ? memberOf(stub.body.json, 'credit_limit') : undefined,
      status: stub.response.status,
      location: stub.response.headers.find((header) => header.name === 'Location')?.value
    };

    expect(read).to.deep.equal({
      method: 'POST',
      idempotencyKey: exact('9b2f6c1e-7d3a-4e8b-a5c4-1f0e9d8c7b6a'),
      prefer: { kind: 'absent' },
      session: exact('sess_7f3a'),
      creditLimit: { kind: 'string', value: '1250.75' },
      status: 201,
      location: '{{origin}}/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d'
    });
  });

  it('keeps an int64 beyond 2^53 as it was written', () => {
    const stub = sampleSuccess('createAccount 201');

    const sequence = stub.response.body.kind === 'json' ? memberOf(stub.response.body.json, 'sequence') : undefined;

    expect(sequence).to.deep.equal({ kind: 'number', text: '9007199254740993' });
  });

  it('reads a null body and a response without one as no body and an empty response', () => {
    const stub = sampleSuccess('deleteAccount 204');

    const read = [stub.route.method, stub.body, stub.response];

    expect(read).to.deep.equal(['DELETE', { kind: 'none' }, { status: 204, headers: [], body: { kind: 'empty' } }]);
  });

  it('reads the route and the response of an error stub', () => {
    const stub = sampleError('getAccount 404');

    const read = [
      stub.route.path.toString(),
      stub.route.path.isLiteral(),
      stub.route.path.matches('/v1/accounts/any-id'),
      stub.route.auth.anyOf.length,
      stub.response.status
    ];

    expect(read).to.deep.equal(['/v1/accounts/{account_id}', false, true, 1, 404]);
  });

  it('writes the JSON data of SSE events compactly and leaves text data as it is', () => {
    const stub = sampleSuccess('streamAccountEvents 200 live');

    const body = stub.response.body;

    expect(body).to.deep.equal({
      kind: 'sse',
      chunkDelayMs: 5,
      events: [
        { id: '1', data: '{"type":"balance.updated","sequence":9007199254740993}' },
        { id: '2', event: 'transaction.posted', retry: 1500, data: '{"type":"transaction.posted","amount":"250.00"}' },
        { data: '[DONE]' }
      ]
    });
    expect(ruleNamed(stub.query.rules, 'since_sequence')).to.deep.equal({ kind: 'absent' });
  });

  it('reads ndjson as one compact document per line, at the default pace', () => {
    const stub = sampleSuccess('exportTransactions 200');

    const body = stub.response.body;

    expect(body).to.deep.equal({
      kind: 'ndjson',
      chunkDelayMs: 20,
      lines: ['{"id":"t1","amount":"250.00"}', '{"id":"t2","amount":"75.50"}']
    });
  });

  it('reads each multipart part with its own rules', () => {
    const stub = sampleSuccess('uploadDocument 201');

    const parts = stub.body.kind === 'multipart' ? stub.body.parts : [];

    expect(parts.map((part) => part.name)).to.deep.equal(['description', 'file', 'metadata']);
    expect(parts[0].parts).to.deep.equal([
      {
        fileName: { kind: 'any' },
        contentType: { kind: 'any' },
        content: { kind: 'text', text: 'Monthly statement for February 2026' }
      }
    ]);
    expect(parts[1].parts).to.deep.equal([
      {
        fileName: exact('statement-2026-02.pdf'),
        contentType: exact('application/pdf'),
        content: { kind: 'bytes', bytes: STATEMENT_PDF }
      }
    ]);
    expect(parts[2].parts.map((part) => [part.fileName, part.contentType, part.content.kind])).to.deep.equal([
      [{ kind: 'any' }, { kind: 'startsWith', prefix: 'application/json' }, 'json']
    ]);
  });

  it('reads every part of a name sent more than once, in wire order', () => {
    const stub = sampleSuccess('uploadStatements 201 two files');

    const parts = stub.body.kind === 'multipart' ? stub.body.parts : [];

    expect(parts.map((part) => [part.name, part.parts.map((each) => each.fileName)])).to.deep.equal([
      ['files', [exact('statement-2026-01.pdf'), exact('statement-2026-02.pdf')]],
      ['note', [{ kind: 'any' }]]
    ]);
  });

  it('reads each field of a form body with its rule', () => {
    const stub = sampleSuccess('settleAccount 200');

    const fields = stub.body.kind === 'form' ? stub.body.fields : [];

    expect(fields).to.deep.equal([
      { name: 'dry_run', rule: { kind: 'absent' } },
      { name: 'filter[since]', rule: exact('2026-02-01') },
      { name: 'note', rule: exact('Month end') },
      { name: 'settled_at', rule: instant('2026-02-28T17:00:00Z') },
      { name: 'tags', rule: { kind: 'each', rules: [exact('rent'), exact('shared')] } }
    ]);
  });

  it('keeps the rules of a JSON body as the objects they were written as', () => {
    const stub = sampleSuccess('createTransaction 201');

    const json = stub.body.kind === 'json' ? stub.body.json : { kind: 'null' as const };

    expect(['idempotency_key', 'posted_at', 'memo'].map((name) => writeJson(memberOf(json, name)))).to.deep.equal([
      '{"$startsWith":"idem_"}',
      '{"$dateTime":"2026-03-01T09:00:00Z"}',
      '{"$any":true}'
    ]);
  });

  it('reads the example name of a success stub, of an error stub, and none where none is given', () => {
    const stubs = [
      sampleSuccess('listTransactions 200 noItems'),
      sampleError('listTransactions 404 unknownAccount'),
      sampleSuccess('listAccounts 200 page 2')
    ];

    const examples = stubs.map((stub) => stub.example);

    expect(examples).to.deep.equal(['noItems', 'unknownAccount', undefined]);
  });

  it('decodes the base64 of a bytes response and of a bytes request body', () => {
    const download = sampleSuccess('downloadDocumentContent 200');
    const replace = sampleSuccess('replaceDocumentContent 200');

    const bodies = [download.response.body, replace.body];

    expect(bodies).to.deep.equal([
      { kind: 'bytes', bytes: STATEMENT_PDF },
      { kind: 'bytes', bytes: STATEMENT_PDF }
    ]);
  });

  it('reads the parts of a multipart response in file order, each with the Content-Type its kind implies or states', () => {
    const stub = sampleSuccess('downloadDocumentBundle 200');

    const body = stub.response.body;

    expect(
      body.kind === 'multipart'
        ? [body.boundary, body.parts.map((part) => [part.name, part.fileName, part.contentType, part.content.kind])]
        : []
    ).to.deep.equal([
      'mockserver-boundary',
      [
        ['metadata', undefined, 'application/json', 'json'],
        ['file', 'statement-2026-02.pdf', 'application/pdf', 'bytes']
      ]
    ]);
  });

  it('fills in the defaults of an oauth2 stub', () => {
    const oauth = sampleOAuth2('oauth2 authorization server');

    const read = { file: oauth.file, settings: oauth.settings, paths: pathsOf(oauth.settings) };

    expect(read).to.deep.equal({
      file: 'oauth2.json',
      settings: {
        tokenPath: '/oauth2/token',
        flows: [
          { kind: 'clientCredentials', accessToken: 'cc-access-token' },
          {
            kind: 'authorizationCode',
            authorizePath: '/oauth2/authorize',
            accessTokenPrefix: 'ac-access-token-',
            refreshTokenPrefix: 'ac-refresh-token-'
          },
          { kind: 'password', username: 'test-user', password: 'test-password', accessToken: 'pw-access-token' },
          { kind: 'implicit', authorizePath: '/oauth2/authorize', accessToken: 'im-access-token' }
        ],
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scopes: ['ledger:read', 'ledger:write', 'audit:read'],
        expiresIn: 3600
      },
      paths: ['/oauth2/token', '/oauth2/authorize']
    });
  });

  for (const [set, stubs] of [
    ['spec-s', 84],
    ['tester-poc', 113]
  ] as const) {
    it(`loads the ${stubs} stubs of the ${set} set`, () => {
      const loaded = fixtureStubs(set);

      expect(loaded.all).to.have.lengthOf(stubs);
    });
  }
});

describe('loadStubs, reading one rule at a time', () => {
  it('needs no credentials for a stub without auth', () => {
    const stub = onlySuccess(successStub());

    expect(stub.route.auth).to.deep.equal({ anyOf: [] });
  });

  it('serves an ndjson line with accents and punctuation as written', () => {
    const stub = onlySuccess(
      successStub({ response: '{ "status": 200, "body": { "ndjson": [ { "note": "café it\'s a+b <c> & d" } ] } }' })
    );

    const chunks = stub.response.body.kind === 'ndjson' ? chunksOf(stub.response.body) : [];

    expect(chunks).to.deep.equal(['{"note":"café it\'s a+b <c> & d"}\n']);
  });

  it('serves SSE object data with accents and punctuation as written', () => {
    const stub = onlySuccess(
      successStub({
        response: '{ "status": 200, "body": { "sse": [ { "data": { "note": "café it\'s a+b <c> & d" } } ] } }'
      })
    );

    const chunks = stub.response.body.kind === 'sse' ? chunksOf(stub.response.body) : [];

    expect(chunks).to.deep.equal(['data: {"note":"café it\'s a+b <c> & d"}\n\n']);
  });

  it('reads a date-time rule written in another offset as its instant', () => {
    const stub = onlySuccess(successStub({ headers: '"X-When": { "dateTime": "2026-01-01T01:00:00+01:00" }' }));

    expect(ruleNamed(stub.route.headers, 'X-When')).to.deep.equal(newYear);
  });

  it('reads each item of an array as a rule of its own', () => {
    const stub = onlySuccess(
      successStub({
        extraRequest:
          '"query": { "at": [ { "dateTime": "2026-01-01T00:00:00Z" }, "literal", { "startsWith": "x" }, { "dateTime": "1767225600" } ] }'
      })
    );

    expect(ruleNamed(stub.query.rules, 'at')).to.deep.equal({
      kind: 'each',
      rules: [newYear, exact('literal'), { kind: 'startsWith', prefix: 'x' }, newYear]
    });
  });

  it('reads each kind of text rule, listed by header name in any letter case', () => {
    const stub = onlySuccess(
      successStub({
        headers: '"x-suffix": { "endsWith": ".pdf" }, "X-Prefix": { "startsWith": "a" }, "X-Part": { "contains": "b" }'
      })
    );

    expect(stub.route.headers).to.deep.equal([
      { name: 'X-Part', rule: { kind: 'contains', fragment: 'b' } },
      { name: 'X-Prefix', rule: { kind: 'startsWith', prefix: 'a' } },
      { name: 'x-suffix', rule: { kind: 'endsWith', suffix: '.pdf' } }
    ]);
  });

  it('reads the date-time rule of a credential', () => {
    const stub = onlySuccess(
      successStub({
        extraRequest:
          '"auth": { "anyOf": [ { "signed": { "in": "header", "name": "X-Signed-At", "dateTime": "2026-01-01T00:00:00Z" } } ] }'
      })
    );

    expect(stub.route.auth.anyOf).to.deep.equal([
      [{ scheme: 'signed', in: 'header', name: 'X-Signed-At', rule: newYear }]
    ]);
  });

  it('reads the boundary a multipart response names and the Content-Type a text part implies', () => {
    const stub = onlySuccess(
      successStub({
        response:
          '{ "status": 200, "body": { "multipart": { "boundary": "b1", "parts": { "note": { "text": "hi" } } } } }'
      })
    );

    expect(stub.response.body).to.deep.equal({
      kind: 'multipart',
      boundary: 'b1',
      parts: [{ name: 'note', contentType: 'text/plain; charset=utf-8', content: { kind: 'text', text: 'hi' } }]
    });
  });

  it('offers client credentials alone when the oauth2 stub names no other flow', () => {
    const stubs = stubsOf({ 'oauth2.json': oauth2Stub() });

    expect(stubs.oauth2Servers.map((server) => server.settings.flows)).to.deep.equal([
      [{ kind: 'clientCredentials', accessToken: 'cc-access-token' }]
    ]);
  });

  it('reads each flow with the tokens it names, in file order', () => {
    const stubs = stubsOf({
      'oauth2.json': oauth2Stub({
        flows:
          '"password": { "username": "u", "password": "p", "accessToken": "t1" }, ' +
          '"implicit": { "authorizePath": "/a", "accessToken": "t2" }, ' +
          '"authorizationCode": { "authorizePath": "/a", "accessTokenPrefix": "x-", "refreshTokenPrefix": "y-" }'
      })
    });

    expect(stubs.oauth2Servers[0].settings.flows).to.deep.equal([
      { kind: 'password', username: 'u', password: 'p', accessToken: 't1' },
      { kind: 'implicit', authorizePath: '/a', accessToken: 't2' },
      { kind: 'authorizationCode', authorizePath: '/a', accessTokenPrefix: 'x-', refreshTokenPrefix: 'y-' }
    ]);
  });

  for (const [written, seconds] of [
    ['77', 77],
    ['60.0', 60]
  ] as const) {
    it(`reads a token lifetime written as ${written}`, () => {
      const stubs = stubsOf({ 'oauth2.json': oauth2Stub({ settings: `"expiresIn": ${written}` }) });

      expect(stubs.oauth2Servers[0].settings.expiresIn).to.equal(seconds);
    });
  }

  for (const status of ['200.0', '2e2']) {
    it(`reads a status written as ${status} as the whole number it is`, () => {
      const stub = onlySuccess(successStub({ response: `{ "status": ${status} }` }));

      expect(stub.response.status).to.equal(200);
    });
  }

  it('reads the whole numbers of a stream however they are written', () => {
    const stub = onlySuccess(
      successStub({
        response: '{ "status": 200, "body": { "sse": [ { "data": "x", "retry": 1500.0 } ] }, "chunkDelayMs": 5.0 }'
      })
    );

    expect(stub.response.body).to.deep.equal({ kind: 'sse', chunkDelayMs: 5, events: [{ retry: 1500, data: 'x' }] });
  });

  for (const name of ['two words', 'a=b', 'back\\slash']) {
    it(`reads the example name '${name}', which a Prefer header can carry`, () => {
      const stub = onlySuccess(successStub({ extraStub: `"example": ${JSON.stringify(name)}` }));

      expect(stub.example).to.equal(name);
    });
  }

  it('loads a credential that travels in the query under any characters, since a query encodes them', () => {
    const stubs = stubsOf({
      'q.json': successStub({
        extraRequest: '"auth": { "anyOf": [ { "key": { "in": "query", "name": "clé", "value": "clé" } } ] }'
      })
    });

    expect(stubs.all).to.have.lengthOf(1);
  });

  for (const [title, response] of [
    [
      'UTF-8 named in upper case',
      '{ "status": 200, "headers": { "Content-Type": "text/plain; charset=UTF-8" }, "body": { "text": "é" } }'
    ],
    [
      'UTF-8 named in quotes',
      '{ "status": 200, "headers": { "Content-Type": "application/json; charset=\\"utf-8\\"" }, "body": { "json": {} } }'
    ],
    ['no charset named', '{ "status": 200, "headers": { "Content-Type": "text/csv" }, "body": { "text": "a,b" } }'],
    [
      'another charset on a bytes body',
      '{ "status": 200, "headers": { "Content-Type": "text/plain; charset=iso-8859-1" }, "body": { "bytes": "6Q==" } }'
    ],
    [
      'another charset on a bytes part',
      '{ "status": 200, "body": { "multipart": { "parts": { "p": { "contentType": "text/plain; charset=iso-8859-1", "bytes": "6Q==" } } } } }'
    ],
    [
      'its multipart boundary stated',
      '{ "status": 200, "headers": { "Content-Type": "multipart/form-data; boundary=mockserver-boundary" }, "body": { "multipart": { "parts": { "p": { "text": "x" } } } } }'
    ],
    [
      'its multipart boundary stated in quotes',
      '{ "status": 200, "headers": { "Content-Type": "multipart/form-data; boundary=\\"mockserver-boundary\\"" }, "body": { "multipart": { "parts": { "p": { "text": "x" } } } } }'
    ],
    [
      'another multipart type in upper case',
      '{ "status": 200, "headers": { "Content-Type": "MULTIPART/MIXED; BOUNDARY=mockserver-boundary" }, "body": { "multipart": { "parts": { "p": { "text": "x" } } } } }'
    ],
    ['no body on a 204', '{ "status": 204 }'],
    ['no body on a 205', '{ "status": 205 }'],
    ['no body on a 304', '{ "status": 304 }'],
    ['a Content-Length on a 304', '{ "status": 304, "headers": { "Content-Length": "1024" } }'],
    ...[200, 203, 206, 303, 305].map((status) => [
      `a body on a ${status}`,
      `{ "status": ${status}, "body": { "text": "x" } }`
    ])
  ]) {
    it(`loads a response with ${title}`, () => {
      const stubs = stubsOf({ 's.json': successStub({ response }) });

      expect(stubs.all).to.have.lengthOf(1);
    });
  }

  it('loads a Content-Length on a HEAD response without a body', () => {
    const stubs = stubsOf({
      's.json': successStub({ method: 'HEAD', response: '{ "status": 200, "headers": { "Content-Length": "1024" } }' })
    });

    expect(stubs.all).to.have.lengthOf(1);
  });
});

describe('loadStubs, reading files', () => {
  it('loads files in ordinal name order, an upper-case name before a lower-case one', () => {
    const stubs = stubsOf({ 'a.json': successStub({ name: 'second' }), 'B.json': successStub({ name: 'first' }) });

    expect(stubs.all.map((stub) => stub.name)).to.deep.equal(['first', 'second']);
  });

  it('loads no stubs from no files', () => {
    const stubs = stubsOf({});

    expect(stubs.all).to.deep.equal([]);
  });

  for (const [name, isStubFile] of [
    ['01-op.json', true],
    ['02-op.JSON', true],
    ['b.Json', true],
    ['._01-op.json', false],
    ['.hidden.json', false],
    ['notes.txt', false],
    ['json', false],
    ['a.json.bak', false]
  ] as const) {
    it(`${isStubFile ? 'takes' : 'skips'} a file named ${name}`, () => {
      const result = isStubFileName(name);

      expect(result).to.equal(isStubFile);
    });
  }

  it('loads a hand-written file with comments and trailing commas', () => {
    const json = `// written by hand\n${successStub().slice(0, -2)}, /* the last */ ]`;

    const stubs = stubsOf({ 'hand.json': json });

    expect(stubs.all).to.have.lengthOf(1);
  });

  it('names the file that is not valid JSON, and where it stops being so', () => {
    const problems = problemsOf({ 'broken.json': '[ { "name": ' });

    expect(problems).to.deep.equal([
      {
        file: 'broken.json',
        path: '',
        message: 'Not valid JSON: the end of the text is not the start of a JSON value at line 1, column 13.'
      }
    ]);
  });

  for (const [title, content, message] of [
    ['an empty file', '', 'The file is empty; a stub file holds an array of stubs.'],
    ['a file of whitespace', ' \n\t ', 'The file is empty; a stub file holds an array of stubs.'],
    ['a file holding null', 'null', 'The file holds JSON null; a stub file holds an array of stubs.']
  ]) {
    it(`says what ${title} holds`, () => {
      const problems = problemsOf({ 'a.json': content });

      expect(problems).to.deep.equal([{ file: 'a.json', path: '', message }]);
    });
  }

  it('says a file in Latin-1 is not UTF-8, rather than reading its accents as replacement characters', () => {
    const latin1 = Buffer.from(successStub({ headers: '"X-Name": "café"' }), 'latin1');

    const problems = problemsOf({ 'latin1.json': latin1 });

    expect(problems).to.deep.equal([{ file: 'latin1.json', path: '', message: 'The file is not UTF-8.' }]);
  });

  it('says so too when a Latin-1 file starts with a UTF-8 byte-order mark', () => {
    const marked = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(successStub({ headers: '"X-Name": "café"' }), 'latin1')
    ]);

    const problems = problemsOf({ 'bom.json': marked });

    expect(problems).to.deep.equal([{ file: 'bom.json', path: '', message: 'The file is not UTF-8.' }]);
  });

  for (const [encoding, mark] of [
    ['utf8', [0xef, 0xbb, 0xbf]],
    ['utf16le', [0xff, 0xfe]]
  ] as const) {
    it(`reads the text of a ${encoding} file behind its byte-order mark`, () => {
      const json = successStub({ extraStub: '"description": "café"' });

      const stubs = stubsOf({ 'bom.json': Buffer.concat([Buffer.from(mark), Buffer.from(json, encoding)]) });

      expect(stubs.all.map((stub) => stub.description)).to.deep.equal(['café']);
    });
  }

  it('reads a UTF-16 file saved big-endian', () => {
    const json = successStub({ extraStub: '"description": "café"' });
    const bigEndian = Buffer.from(json, 'utf16le').swap16();

    const stubs = stubsOf({ 'bom.json': Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndian]) });

    expect(stubs.all.map((stub) => stub.description)).to.deep.equal(['café']);
  });

  for (const [title, json, fault] of [
    [
      'a key written twice',
      '[ { "name": "s", "name": "t", "operation": "op", "request": { "method": "GET", "path": "/v1/x" }, "response": { "status": 200 } } ]',
      "Duplicate property 'name'"
    ],
    ['a lone surrogate in a header value', successStub({ headers: '"X-A": "\\ud83d"' }), 'surrogate'],
    ['a lone surrogate in a description', successStub({ extraStub: '"description": "\\udc00"' }), 'surrogate'],
    ['a lone surrogate in a key', successStub({ extraStub: '"\\ud83d": 1' }), 'surrogate']
  ]) {
    it(`reports ${title} as JSON that is not strict, with the problems of the other files`, () => {
      const problems = problemsOf({ 'a.json': json, 'b.json': errorStub({ status: 200 }) });

      expect(problems.map((problem) => problem.file)).to.deep.equal(['a.json', 'b.json']);
      expect(problems[0].message).to.include('Not valid JSON: ').and.to.include(fault);
    });
  }

  it('reports a file that could not be read, with the reason', () => {
    const unreadable = { name: 'missing.json', content: err('ENOENT: no such file or directory') };

    const loaded = loadStubs([unreadable], stubSchema);

    expect(loaded._unsafeUnwrapErr()).to.deep.equal([
      { file: 'missing.json', path: '', message: 'The file could not be read: ENOENT: no such file or directory' }
    ]);
  });
});

describe('loadStubs, reporting problems', () => {
  it('goes on to the other stubs of a file when the schema refuses one, so one run lists every problem', () => {
    const problems = located({
      'a.json': successStub({ name: 'first' }),
      'b.json': `[
        { "name": "typo", "operation": "op", "request": { "method": "GET", "path": "/v1/a", "querymode": "open" }, "response": { "status": 200 } },
        { "name": "first", "operation": "op", "request": { "method": "GET", "path": "/v1/b" }, "response": { "status": 200, "body": { "bytes": "!!" } } },
        { "name": "joined", "operation": "op", "request": { "method": "GET", "path": "/v1//d" }, "response": { "status": 200 } }
      ]`
    });

    expect(problems).to.deep.equal([
      'b.json /0/request/querymode',
      'b.json /1/name',
      'b.json /1/response/body/bytes',
      'b.json /2/request/path'
    ]);
  });

  it('lists the problems of one file in stub order, the third stub before the eleventh', () => {
    const sound = Array.from(
      { length: 12 },
      (_, index) =>
        `{ "name": "s${index}", "operation": "op", "request": { "method": "GET", "path": "/v1/${index}" }, "response": { "status": 200 } }`
    );
    sound[2] = sound[2].replace('/v1/2', 'relative');
    sound[10] = sound[10].replace('/v1/10', 'relative');
    sound[11] = sound[11].replace('s11', 's3');

    const problems = located({ 'g.json': `[ ${sound.join(', ')} ]` });

    expect(problems).to.deep.equal(['g.json /2/request/path', 'g.json /10/request/path', 'g.json /11/name']);
  });

  it('lists the problems of several files by file', () => {
    const problems = located({ 'a.json': successStub(), 'b.json': successStub(), 'c.json': '' });

    expect(problems).to.deep.equal(['b.json /0/name', 'c.json']);
  });

  it('reports a name used in two files on the later one, naming the first', () => {
    const problems = problemsOf({ 'a.json': successStub(), 'b.json': successStub() });

    expect(problems.map(problemLine)).to.deep.equal([
      "b.json [s] /0/name: Another stub named 's' exists in a.json; names must be unique across all files."
    ]);
  });

  for (const interim of [
    '{ "status": 100 }',
    '{ "status": 103 }',
    '{ "status": 199 }',
    '{ "status": 100, "body": { "sse": [ { "data": "x" } ] } }',
    '{ "status": 199, "body": { "ndjson": [ {} ] } }',
    '{ "status": 103, "body": { "multipart": { "parts": { "p": { "text": "x" } } } } }'
  ]) {
    it(`reports the status alone of the interim response ${interim}`, () => {
      const problems = problemsOf({ 's.json': successStub({ response: interim }) });

      expect(problems.map((problem) => problem.path)).to.deep.equal(['/0/response/status']);
      expect(problems[0].message).to.include('Must be at least 200');
    });
  }

  it('reports each of two bad path segments', () => {
    const problems = problemsOf({ 's.json': successStub({ path: '/a{b}/{c d}' }) });

    expect(problems.map(problemLine)).to.deep.equal([
      "s.json [s] /0/request/path: 'a{b}' mixes literal text and braces; a parameter must be a whole segment such as {id}.",
      "s.json [s] /0/request/path: '{c d}' is not a valid path parameter; use {name} with letters, digits, '_', '-' or '.'."
    ]);
  });

  for (const header of [
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
  ]) {
    it(`reports a response that states ${header}`, () => {
      const problems = problemsOf({
        's.json': successStub({ response: `{ "status": 200, "headers": { "${header}": "x" } }` })
      });

      expect(problems.map((problem) => problem.path)).to.deep.equal([`/0/response/headers/${header}`]);
      expect(problems[0].message).to.include(`A stub's response does not state ${header}: `);
    });
  }

  for (const [json, pointer, path] of [
    [successStub({ path: '/__admin/health' }), '/0/request/path', '/__admin/health'],
    [successStub({ path: '/__admin/{x}' }), '/0/request/path', '/__admin/{x}'],
    [successStub({ path: '/__Admin' }), '/0/request/path', '/__Admin'],
    [errorStub({ path: '/__ADMIN/{id}' }), '/0/request/path', '/__ADMIN/{id}'],
    [oauth2Stub({ tokenPath: '/__admin/token' }), '/0/oauth2/tokenPath', '/__admin/token'],
    [
      oauth2Stub({ flows: '"authorizationCode": { "authorizePath": "/__admin/authorize" }' }),
      '/0/oauth2/flows/authorizationCode/authorizePath',
      '/__admin/authorize'
    ]
  ]) {
    it(`reports ${path}, a path under the admin prefix, at its pointer`, () => {
      const problems = problemsOf({ 'a.json': json, 'b.json': successStub({ name: 'other' }) });

      expect(problems.map((problem) => [problem.file, problem.path, problem.message])).to.deep.equal([
        ['a.json', pointer, `${path} is under /__admin, which the mock's admin API answers before any stub.`]
      ]);
    });
  }

  it('loads a path that only starts like the admin prefix', () => {
    const stubs = stubsOf({ 'a.json': successStub({ path: '/__administrators' }) });

    expect(stubs.all).to.have.lengthOf(1);
  });

  it('reports admin paths beside another problem, every one in stub order', () => {
    const problems = located({
      'a.json': `[
        { "name": "auth", "kind": "oauth2", "oauth2": { "tokenPath": "/__admin/token", "flows": { "clientCredentials": {} }, "clientId": "c", "clientSecret": "s" } },
        { "name": "upper", "operation": "op", "request": { "method": "GET", "path": "/__ADMIN/y" }, "response": { "status": 200 } },
        { "name": "delay", "operation": "op", "request": { "method": "GET", "path": "/v1/z" }, "response": { "status": 200, "chunkDelayMs": 5 } }
      ]`
    });

    expect(problems).to.deep.equal([
      'a.json /0/oauth2/tokenPath',
      'a.json /1/request/path',
      'a.json /2/response/chunkDelayMs'
    ]);
  });
});

describe('loadStubs, checking across files', () => {
  it('loads two oauth2 stubs on paths of their own', () => {
    const stubs = stubsOf({
      'a.json': oauth2Stub({ name: 'one' }),
      'b.json': oauth2Stub({ name: 'two', tokenPath: '/other/token' })
    });

    expect(stubs.oauth2Servers.map((server) => server.name)).to.deep.equal(['one', 'two']);
  });

  for (const path of ['/oauth2/token', '/oauth2/authorize']) {
    it(`reports an endpoint stub on ${path}, which an oauth2 stub answers`, () => {
      const problems = problemsOf({
        'a.json': oauth2Stub({ flows: '"authorizationCode": { "authorizePath": "/oauth2/authorize" }' }),
        'b.json': successStub({ path })
      });

      expect(problems.map(problemLine)).to.deep.equal([
        `b.json [s] /0/request/path: The oauth2 stub 'oauth' in a.json answers every request to ${path}, so this stub never would.`
      ]);
    });
  }

  it('loads a template over an oauth2 path, which still serves its other values', () => {
    const stubs = stubsOf({ 'a.json': oauth2Stub(), 'b.json': successStub({ path: '/oauth2/{x}' }) });

    expect(stubs.all).to.have.lengthOf(2);
  });

  it('reports the second of two oauth2 stubs on one token path', () => {
    const problems = problemsOf({ 'a.json': oauth2Stub({ name: 'one' }), 'b.json': oauth2Stub({ name: 'two' }) });

    expect(problems.map(problemLine)).to.deep.equal([
      "b.json [two] /0/oauth2/tokenPath: Another oauth2 stub, 'one' in a.json, already serves /oauth2/token; the first server to claim a path answers for it, so this one never would."
    ]);
  });

  it('reports the second of two oauth2 stubs that share an authorize path, at its flows', () => {
    const problems = problemsOf({
      'a.json': oauth2Stub({ name: 'one', flows: '"implicit": { "authorizePath": "/authorize" }' }),
      'b.json': oauth2Stub({
        name: 'two',
        tokenPath: '/other/token',
        flows: '"authorizationCode": { "authorizePath": "/authorize" }'
      })
    });

    expect(problems.map((problem) => [problem.stub, problem.path])).to.deep.equal([['two', '/0/oauth2/flows']]);
    expect(problems[0].message).to.include('already serves /authorize;');
  });

  it("reports an error stub whose literal path an earlier operation's template would answer for", () => {
    const problems = problemsOf({
      '01-getUser.json': errorStub({ name: 'getUser 404', operation: 'getUser', path: '/v1/users/{user_id}' }),
      '02-getMe.json': errorStub({ name: 'getMe 404', operation: 'getMe', path: '/v1/users/me' })
    });

    expect(problems.map(problemLine)).to.deep.equal([
      "02-getMe.json [getMe 404] /0/request/path: The error stub 'getUser 404' of getUser in 01-getUser.json comes " +
        'first and its path /v1/users/{user_id} also matches GET /v1/users/me with Prefer: code=404, so it would ' +
        'answer for this one; getMe must come before getUser.'
    ]);
  });

  it('reports the more specific of two templates when it comes second', () => {
    const problems = problemsOf({
      '01-getRelease.json': errorStub({
        name: 'getRelease 404',
        operation: 'getRelease',
        path: '/v1/repos/{repo}/releases/{release_id}'
      }),
      '02-getLatestRelease.json': errorStub({
        name: 'getLatestRelease 404',
        operation: 'getLatestRelease',
        path: '/v1/repos/{repo}/releases/latest'
      })
    });

    expect(problems.map((problem) => [problem.file, problem.stub])).to.deep.equal([
      ['02-getLatestRelease.json', 'getLatestRelease 404']
    ]);
  });

  for (const [title, earlierPath, operation, method, status, path] of [
    ['the literal path comes first', '/v1/users/me', 'getUser', 'GET', 404, '/v1/users/{user_id}'],
    ['both are of one operation', '/v1/users/{user_id}', 'getMe', 'GET', 404, '/v1/users/me'],
    ['the methods differ', '/v1/users/{user_id}', 'getUser', 'DELETE', 404, '/v1/users/me'],
    ['the statuses differ', '/v1/users/{user_id}', 'getUser', 'GET', 401, '/v1/users/me'],
    ['the later path is longer', '/v1/users/{user_id}', 'getUser', 'GET', 404, '/v1/users/me/avatar'],
    ['the paths match each other', '/v1/users/{user_id}', 'getUser', 'GET', 404, '/v1/users/{me}'],
    ['the paths are one literal path', '/v1/users/me', 'getUser', 'GET', 404, '/v1/users/me'],
    ['the paths merely overlap', '/v1/{tenant}/accounts', 'getUser', 'GET', 404, '/v1/accounts/{account_id}']
  ] as const) {
    it(`loads two error stubs when ${title}, since the earlier cannot answer for the later`, () => {
      const stubs = stubsOf({
        '01-earlier.json': errorStub({ name: 'earlier', operation: 'getMe', path: earlierPath }),
        '02-later.json': errorStub({ name: 'later', status, operation, method, path })
      });

      expect(stubs.all).to.have.lengthOf(2);
    });
  }
});
