import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { Difference, ECHO_LIMIT } from '../../../../src/types/mock/matching/difference.js';
import { answers, differencesFrom } from '../../../../src/types/mock/matching/stub-matcher.js';
import { EndpointStub } from '../../../../src/types/mock/stub-format/stub.js';
import { ledger, sampleRequests, TestRequest } from '../../../helpers/mock-requests.js';
import { errorStub, sampleError, sampleSuccess, stubsOf, successStub } from '../../../helpers/mock-stubs.js';

const NOT_A_PARAMETER = 'absent (not a parameter of this stub)';
const PARTS_A_AND_B = '"body": { "multipart": { "parts": { "a": { "text": "a" }, "b": { "text": "b" } } } }';
const QUERY_KEY = '"auth": { "anyOf": [ { "apiKeyQuery": { "in": "query", "name": "api_key", "value": "k" } } ] }';
const QUERY_KEY_OR_BASIC = `"auth": { "anyOf": [
  { "apiKeyQuery": { "in": "query", "name": "api_key", "value": "${ledger.apiKey}" } },
  { "basicAuth": { "in": "header", "name": "Authorization", "value": "${ledger.basicHeader}" } } ] }`;

const only = (json: string): EndpointStub => stubsOf({ 's.json': json }).endpoints[0];
const withRequest = (members: string) => only(successStub({ extraRequest: members }));
const withBody = (body: string) => only(successStub({ body: `"body": ${body}` }));
const authorization = (rule: string, header = 'Authorization') =>
  withRequest(`"auth": { "anyOf": [ { "scheme": { "in": "header", "name": "${header}", ${rule} } } ] }`);
const get = () => TestRequest.get('/v1/x');
const account = () => TestRequest.get(`/v1/accounts/${ledger.accountA}`);
const diff = (stub: EndpointStub, request: TestRequest) => differencesFrom(stub, request.build());
const text = (content: string | Uint8Array, name: string) => ({ name, content });

describe('differencesFrom, on the route', () => {
  for (const [title, stub, request] of [
    ['the exact request', () => sampleSuccess('listAccounts 200 page 2'), sampleRequests.listAccountsPage2()],
    [
      'header names in another letter case',
      () => sampleSuccess('listAccounts 200 page 2'),
      TestRequest.get('/v1/accounts')
        .query('offset', '1')
        .query('tags', 'rent', 'shared')
        .query('cursor', 'cur_7f3a')
        .header('accept', 'application/json')
        .header('x-api-key', ledger.apiKey)
        .header('authorization', ledger.basicHeader)
    ],
    [
      'the other credential set',
      () => sampleSuccess('listAccounts 200 page 2'),
      sampleRequests.listAccountsPage2(false).apiKey().basic()
    ],
    [
      'a credential in the query, which is no unexpected key',
      () => withRequest(QUERY_KEY),
      get().query('api_key', 'k')
    ],
    [
      'a query credential with its value beside Basic',
      () => withRequest(QUERY_KEY_OR_BASIC),
      get().query('api_key', ledger.apiKey).basic()
    ],
    [
      'a credential in a cookie',
      () =>
        withRequest('"auth": { "anyOf": [ { "apiKeyCookie": { "in": "cookie", "name": "api_key", "value": "k" } } ] }'),
      get().cookie('api_key', 'k')
    ],
    [
      'an Authorization scheme in lower case',
      () => authorization('"value": "Bearer t"'),
      get().header('Authorization', 'bearer t')
    ],
    [
      'an Authorization scheme in upper case',
      () => authorization('"value": "Basic dTpw"'),
      get().header('Authorization', 'BASIC dTpw')
    ],
    [
      'an Authorization scheme in mixed case before a prefix rule',
      () => authorization('"startsWith": "Bearer ac-access-token-"'),
      get().header('Authorization', 'bEARER ac-access-token-1')
    ],
    [
      'a scheme HTTP does not define, in lower case',
      () => authorization('"value": "Token t"'),
      get().header('Authorization', 'token t')
    ],
    [
      'a date-time header in the RFC 1123 spelling',
      () => only(successStub({ headers: '"If-Modified-Since": { "dateTime": "2025-12-09T14:30:00Z" }' })),
      get().header('If-Modified-Since', 'Tue, 09 Dec 2025 14:30:00 GMT')
    ]
  ] as const) {
    it(`finds no difference in ${title}`, () => {
      const differences = diff(stub(), request);

      expect(differences).to.deep.equal([]);
    });
  }

  it('reports the method in the letter case it was sent in', () => {
    const differences = diff(only(successStub({ method: 'PATCH' })), TestRequest.of('patch', '/v1/x'));

    expect(differences).to.deep.equal([new Difference('method', '', 'PATCH', 'patch')]);
  });

  it('reports another path against the template', () => {
    const differences = diff(
      sampleError('getAccount 404'),
      TestRequest.get('/v1/account/1').bearer().prefer('code=404')
    );

    expect(differences).to.deep.equal([new Difference('path', '', '/v1/accounts/{account_id}', '/v1/account/1')]);
  });

  it('reports a missing header by its rule', () => {
    const request = TestRequest.get('/v1/accounts')
      .query('offset', '1')
      .query('tags', 'rent', 'shared')
      .query('cursor', 'cur_7f3a')
      .bearer();

    const differences = diff(sampleSuccess('listAccounts 200 page 2'), request);

    expect(differences).to.deep.equal([
      new Difference('header', 'Accept', "starting with 'application/json'", 'absent')
    ]);
  });

  it('reports another cookie value', () => {
    const differences = diff(
      sampleSuccess('createAccount 201'),
      sampleRequests.createAccount({ sessionCookie: 'sess_other' })
    );

    expect(differences).to.deep.equal([new Difference('cookie', 'ledger_session', ledger.sessionCookie, 'sess_other')]);
  });

  it('reports both values of a cookie sent twice', () => {
    const request = sampleRequests.createAccount().cookie('ledger_session', 'sess_other');

    const differences = diff(sampleSuccess('createAccount 201'), request);

    expect(differences).to.deep.equal([
      new Difference('cookie', 'ledger_session', ledger.sessionCookie, `${ledger.sessionCookie} & sess_other`)
    ]);
  });

  it('reports a cookie sent under another letter case of its name as absent', () => {
    const differences = diff(withRequest('"cookies": { "sid": "s1" }'), get().cookie('SID', 's1'));

    expect(differences).to.deep.equal([new Difference('cookie', 'sid', 's1', 'absent')]);
  });
});

describe('differencesFrom, on credentials', () => {
  it('explains every alternative when no credential set is satisfied', () => {
    const request = sampleRequests.listAccountsPage2(false).apiKey();

    const differences = diff(sampleSuccess('listAccounts 200 page 2'), request);

    expect(differences).to.deep.equal([
      new Difference('auth', '', 'one of [bearerAuth] or [apiKeyHeader + basicAuth]', 'none satisfied'),
      new Difference('auth', 'bearerAuth', 'header Authorization: Bearer test-bearer-token', 'absent'),
      new Difference('auth', 'basicAuth', `header Authorization: ${ledger.basicHeader}`, 'absent')
    ]);
  });

  for (const apiKey of ['x', '']) {
    it(`reports a query credential holding '${apiKey}' as an extra key, beside a Basic header that authenticates`, () => {
      const request = get().query('api_key', apiKey).basic();

      const differences = diff(withRequest(QUERY_KEY_OR_BASIC), request);

      expect(differences).to.deep.equal([new Difference('query', 'api_key', NOT_A_PARAMETER, apiKey)]);
    });
  }

  it('reports a query credential with another value under auth alone', () => {
    const differences = diff(withRequest(QUERY_KEY), get().query('api_key', 'wrong'));

    expect(differences).to.deep.equal([new Difference('auth', 'apiKeyQuery', 'query api_key: k', 'wrong')]);
  });

  it('reports a query credential with another value under auth alone when nothing else authenticates', () => {
    const differences = diff(withRequest(QUERY_KEY_OR_BASIC), get().query('api_key', 'x'));

    expect(differences).to.deep.equal([
      new Difference('auth', '', 'one of [apiKeyQuery] or [basicAuth]', 'none satisfied'),
      new Difference('auth', 'apiKeyQuery', `query api_key: ${ledger.apiKey}`, 'x'),
      new Difference('auth', 'basicAuth', `header Authorization: ${ledger.basicHeader}`, 'absent')
    ]);
  });

  for (const [header, value, sent] of [
    ['Authorization', 'Bearer t', 'bearer wrong'],
    ['Authorization', 'Bearer t', 'bearer T'],
    ['Authorization', 'Bearer t', 'bearert'],
    ['X-API-Key', 'Key t', 'key t']
  ]) {
    it(`reports '${sent}' as it was sent against ${header}: ${value}, since only a scheme ignores letter case`, () => {
      const differences = diff(authorization(`"value": "${value}"`, header), get().header(header, sent));

      expect(differences).to.deep.equal([new Difference('auth', 'scheme', `header ${header}: ${value}`, sent)]);
    });
  }

  it('reports the scheme of an error stub whose credentials are missing', () => {
    const differences = diff(sampleError('getAccount 404'), account().prefer('code=404'));

    expect(differences).to.deep.equal([
      new Difference('auth', 'bearerAuth', 'header Authorization: Bearer test-bearer-token', 'absent')
    ]);
  });
});

describe('differencesFrom, on the Prefer header', () => {
  for (const [title, stub, request] of [
    [
      'a success stub asked for its own status',
      () => sampleSuccess('listAccounts 200 page 2'),
      sampleRequests.listAccountsPage2().prefer('code=200')
    ],
    ['an error stub asked for its status', () => sampleError('getAccount 404'), account().bearer().prefer('code=404')],
    [
      'an error stub sent a query and a body, which it does not look at',
      () => sampleError('getAccount 404'),
      account().query('anything', 'goes').bearer().prefer('code=404').json('{}')
    ],
    [
      'a named stub asked for its example',
      () => sampleSuccess('listTransactions 200 noItems'),
      sampleRequests.listTransactions().prefer('example=noItems')
    ],
    [
      'a named stub asked for no example',
      () => sampleSuccess('listTransactions 200 noItems'),
      sampleRequests.listTransactions()
    ],
    [
      'an error stub asked for its status and its example',
      () => sampleError('listTransactions 404 unknownAccount'),
      sampleRequests.listTransactions().prefer('code=404, example=unknownAccount')
    ]
  ] as const) {
    it(`finds no difference for ${title}`, () => {
      const differences = diff(stub(), request);

      expect(differences).to.deep.equal([]);
    });
  }

  for (const [title, stub, request, expected, actual] of [
    [
      'a success stub asked for another status',
      () => sampleSuccess('listAccounts 200 page 2'),
      sampleRequests.listAccountsPage2().prefer('code=404'),
      'no code= preference, or code=200',
      'code=404'
    ],
    [
      'an error stub asked for another status',
      () => sampleError('getAccount 404'),
      account().bearer().prefer('code=500'),
      'code=404',
      'code=500'
    ],
    [
      'an error stub asked for no status',
      () => sampleError('getAccount 404'),
      account().bearer().prefer('respond-async'),
      'code=404',
      'absent'
    ],
    [
      'an error stub sent no Prefer at all',
      () => sampleError('getAccount 404'),
      account().bearer(),
      'code=404',
      'absent'
    ],
    [
      'a named stub asked for another example',
      () => sampleSuccess('listTransactions 200 noItems'),
      sampleRequests.listTransactions().prefer('example=firstPage'),
      'example=noItems',
      'example=firstPage'
    ],
    [
      'a named stub asked for its example in another letter case',
      () => sampleSuccess('listTransactions 200 noItems'),
      sampleRequests.listTransactions().prefer('example=NOITEMS'),
      'example=noItems',
      'example=NOITEMS'
    ],
    [
      'a stub without an example asked for one',
      () => sampleSuccess('listAccounts 200 page 2'),
      sampleRequests.listAccountsPage2().prefer('example=page2'),
      'no example= preference (this stub has no example)',
      'example=page2'
    ],
    [
      'an error stub asked for its status and another example',
      () => sampleError('listTransactions 404 unknownAccount'),
      sampleRequests.listTransactions().prefer('code=404, example=firstPage'),
      'example=unknownAccount',
      'example=firstPage'
    ]
  ] as const) {
    it(`reports the preference of ${title}`, () => {
      const differences = diff(stub(), request);

      expect(differences).to.deep.equal([new Difference('header', 'Prefer', expected, actual)]);
    });
  }

  it("reports an error stub's missing header and cookie, which it checks as a success stub does", () => {
    const stub = only(errorStub({ extraRequest: '"headers": { "X-Tenant": "t1" }, "cookies": { "session": "s1" }' }));

    const differences = diff(stub, TestRequest.get('/v1/1').prefer('code=404'));

    expect(differences).to.deep.equal([
      new Difference('header', 'X-Tenant', 't1', 'absent'),
      new Difference('cookie', 'session', 's1', 'absent')
    ]);
  });
});

describe('differencesFrom, on the query string', () => {
  it('reports a key a closed query does not name', () => {
    const request = sampleRequests.listAccountsPage2().query('verbose', 'true');

    const differences = diff(sampleSuccess('listAccounts 200 page 2'), request);

    expect(differences).to.deep.equal([new Difference('query', 'verbose', NOT_A_PARAMETER, 'true')]);
  });

  it('reports both values of an unknown key sent twice', () => {
    const request = sampleRequests.listAccountsPage2().query('verbose', 'true', 'false');

    const differences = diff(sampleSuccess('listAccounts 200 page 2'), request);

    expect(differences).to.deep.equal([new Difference('query', 'verbose', NOT_A_PARAMETER, 'true & false')]);
  });

  it('reports a key in another letter case as two keys: the one missing and the one unknown', () => {
    const request = TestRequest.get('/v1/accounts')
      .query('Offset', '1')
      .query('tags', 'rent', 'shared')
      .query('cursor', 'cur_7f3a')
      .header('Accept', 'application/json')
      .bearer();

    const differences = diff(sampleSuccess('listAccounts 200 page 2'), request);

    expect(differences).to.deep.equal([
      new Difference('query', 'offset', '1', 'absent'),
      new Difference('query', 'Offset', NOT_A_PARAMETER, '1')
    ]);
  });

  it('lets a key an open query does not name pass', () => {
    const stub = withRequest('"query": { "a": "1" }, "queryMode": "open"');

    const differences = diff(stub, get().query('a', '1').query('b', '2'));

    expect(differences).to.deep.equal([]);
  });

  it('still holds an open query to the rules it declares', () => {
    const stub = withRequest('"query": { "a": "1", "limit": null }, "queryMode": "open"');

    const differences = diff(stub, get().query('a', '2').query('limit', '5').query('b', '3'));

    expect(differences).to.deep.equal([
      new Difference('query', 'a', '1', '2'),
      new Difference('query', 'limit', 'absent', '5')
    ]);
  });
});

describe('differencesFrom, on the body', () => {
  for (const [title, stub, request] of [
    ['any body under a stub that takes any', () => withBody('{ "any": true }'), get().text('whatever')],
    ['no body under an empty text expectation', () => withBody('{ "text": "" }'), get()],
    ['no body under an empty bytes expectation', () => withBody('{ "bytes": "" }'), get()],
    ['no body under an empty form expectation', () => withBody('{ "form": {} }'), get()],
    [
      'the multipart body the stub describes',
      () => sampleSuccess('uploadDocument 201'),
      sampleRequests.uploadDocument()
    ],
    ['the form the stub describes', () => sampleSuccess('settleAccount 200'), sampleRequests.settleAccount()],
    [
      'a form date-time in another spelling',
      () => sampleSuccess('settleAccount 200'),
      sampleRequests.settleAccount(
        ['note', 'Month end'],
        ['tags', 'rent'],
        ['tags', 'shared'],
        ['filter[since]', '2026-02-01'],
        ['settled_at', '2026-02-28T18:00:00.000+01:00']
      )
    ],
    [
      'repeated parts in the order the stub lists them',
      () => sampleSuccess('uploadStatements 201 two files'),
      sampleRequests.uploadStatements('statement-2026-01.pdf', 'statement-2026-02.pdf')
    ],
    [
      'a JSON body that meets every rule',
      () => sampleSuccess('createTransaction 201'),
      sampleRequests.createTransaction()
    ],
    [
      'a JSON date-time sent as a number of Unix seconds',
      () => sampleSuccess('createTransaction 201'),
      sampleRequests.createTransaction(
        ledger.createTransactionBody.replace('"2026-03-01T10:00:00+01:00"', '1772355600')
      )
    ],
    [
      'a surrogate pair under $any',
      () => withBody('{ "json": { "m": { "$any": true } } }'),
      get().json('{"m":"\\ud83d\\ude00"}')
    ]
  ] as const) {
    it(`finds no difference in ${title}`, () => {
      const differences = diff(stub(), request);

      expect(differences).to.deep.equal([]);
    });
  }

  it('reports a body sent to a stub that has none, by its length and hash', () => {
    const request = TestRequest.delete(`/v1/accounts/${ledger.accountA}`).bearer().json('{}');

    const differences = diff(sampleSuccess('deleteAccount 204'), request);

    expect(differences).to.deep.equal([
      new Difference('body', '', 'no body', '2 bytes, sha256 RBNvo1WzZ4oRRq0W9+hknpT7T8If536DEMBg9hyq/4o=')
    ]);
  });

  it('reports no content where a JSON body is expected', () => {
    const differences = diff(withBody('{ "json": { "m": "x" } }'), get());

    expect(differences).to.deep.equal([new Difference('body', '', 'a JSON body', 'no content')]);
  });

  it('reports no content where text is expected', () => {
    const differences = diff(withBody('{ "text": "hello" }'), get());

    expect(differences).to.deep.equal([new Difference('body', '', 'hello', 'no content')]);
  });

  for (const sent of ['HELLO', 'hello\n']) {
    it(`reports the text ${JSON.stringify(
      sent
    )} against 'hello': no letter case is folded and no line end trimmed`, () => {
      const differences = diff(withBody('{ "text": "hello" }'), get().text(sent));

      expect(differences).to.deep.equal([new Difference('body', '', 'hello', sent)]);
    });
  }

  it('reports text sent in another charset as bytes that are not UTF-8', () => {
    const request = get().bytes(Buffer.from('café', 'latin1'), 'text/plain; charset=iso-8859-1');

    const differences = diff(withBody('{ "text": "café" }'), request);

    expect(differences).to.deep.equal([new Difference('body', '', 'UTF-8 text', 'bytes that are not UTF-8')]);
  });

  it('reports another JSON value at its pointer', () => {
    const request = sampleRequests.createAccount({ body: ledger.createAccountBody.replace('1250.75', '1250.00') });

    const differences = diff(sampleSuccess('createAccount 201'), request);

    expect(differences).to.deep.equal([new Difference('body', '/credit_limit', '"1250.75"', '"1250.00"')]);
  });

  it('reports a JSON rule that is not met with the rule and the value', () => {
    const request = sampleRequests.createTransaction(ledger.createTransactionBody.replace('idem_8c1f', '8c1f'));

    const differences = diff(sampleSuccess('createTransaction 201'), request);

    expect(differences).to.deep.equal([
      new Difference('body', '/idempotency_key', "a string starting with 'idem_'", '"8c1f"')
    ]);
  });

  for (const [title, json] of [
    ['a key sent twice', '{"m":"x","m":"x"}'],
    ['a high surrogate alone', '{"m":"\\ud83d"}'],
    ['a low surrogate alone', '{"m":"\\udc00"}'],
    ['a lone surrogate in a key', '{"\\ud83d":"x"}']
  ]) {
    it(`reports a body with ${title} as not JSON`, () => {
      const differences = diff(withBody('{ "json": { "m": "x" } }'), get().json(json));

      expect(differences.map(({ where, name, expected }) => [where, name, expected])).to.deep.equal([
        ['body', '', 'JSON']
      ]);
      expect(differences[0].actual.startsWith('not JSON: ')).to.be.true;
    });
  }

  for (const expected of ['{ "m": { "$any": true } }', '{ "m": 1 }']) {
    it(`reports a JSON body sent in Latin-1 as not UTF-8, also against ${expected}`, () => {
      const request = get().bytes(Buffer.from('{"m":"José"}', 'latin1'), 'application/json');

      const differences = diff(withBody(`{ "json": ${expected} }`), request);

      expect(differences).to.deep.equal([new Difference('body', '', 'JSON', 'not JSON: bytes that are not UTF-8')]);
    });
  }

  for (const [expected, json] of [
    ['{ "m": { "$any": true } }', '{"m":"\\ud83d"}'],
    ['{ "m": { "$any": true } }', '{"m":{"x":["\\udc00"]}}'],
    ['{ "m": { "$any": true } }', '{"m":{"\\ud83d":1}}'],
    ['{ "$any": true }', ' "\\ud83d" ']
  ]) {
    it(`reports the lone surrogate in ${json} as not JSON, although ${expected} would take any value`, () => {
      const differences = diff(withBody(`{ "json": ${expected} }`), get().json(json));

      expect(differences.map(({ where, name, expected: wanted }) => [where, name, wanted])).to.deep.equal([
        ['body', '', 'JSON']
      ]);
      expect(differences[0].actual).to.include('surrogate');
    });
  }

  it('quotes a body that is no JSON no further than the echo limit', () => {
    const request = get().json(`f${'a'.repeat(50_000)}`);

    const differences = diff(withBody('{ "json": { "m": "x" } }'), request);

    expect(differences).to.have.lengthOf(1);
    expect(differences[0].actual.length).to.be.lessThan(ECHO_LIMIT + 30);
  });

  it('names a long JSON body read as one form field no further than the echo limit', () => {
    const request = get().json(`{"note":"${'a'.repeat(20_000)}"}`);

    const differences = diff(withBody('{ "form": { "a": "1" } }'), request);

    const longName = differences.find((difference) => difference.name.endsWith('... (20011 characters)'));
    expect(longName?.name.length).to.be.lessThan(ECHO_LIMIT + 30);
  });

  it('reports other bytes by length and hash', () => {
    const request = TestRequest.put(`/v1/documents/${ledger.documentD1}/content`)
      .bearer()
      .bytes(Buffer.from('%PDF-1.7\n%%EOF\n'));

    const differences = diff(sampleSuccess('replaceDocumentContent 200'), request);

    expect(differences).to.deep.equal([
      new Difference(
        'body',
        '',
        '9 bytes, sha256 Bxb5Jkyf4Z9ddFUnYQfz3cwdNJf2PWBomnNViuihv14=',
        '15 bytes, sha256 HnMTrOePD7SBpIaTm0iFkCZjECgYCQgFUVVT2E4Lv9M='
      )
    ]);
  });

  it('reports other bytes of the same length by their hash', () => {
    const request = TestRequest.put(`/v1/documents/${ledger.documentD1}/content`)
      .bearer()
      .bytes(Buffer.from('%PDF-1.6\n'));

    const differences = diff(sampleSuccess('replaceDocumentContent 200'), request);

    expect(differences).to.deep.equal([
      new Difference(
        'body',
        '',
        '9 bytes, sha256 Bxb5Jkyf4Z9ddFUnYQfz3cwdNJf2PWBomnNViuihv14=',
        '9 bytes, sha256 kILuxca6bhkNOPYBTS6M+rsKuylDuzrxxUN/InWQpJo='
      )
    ]);
  });
});

describe('differencesFrom, on a form', () => {
  it('reports each field that is wrong, missing or not of the stub', () => {
    const request = sampleRequests.settleAccount(
      ['note', 'Month end'],
      ['tags', 'rent'],
      ['filter[since]', '2026-02-01'],
      ['settled_at', '2026-02-28T18:00:00Z'],
      ['extra', '1']
    );

    const differences = diff(sampleSuccess('settleAccount 200'), request);

    expect(differences).to.deep.equal([
      new Difference('form', 'settled_at', 'a date-time equal to 2026-02-28T17:00:00Z', '2026-02-28T18:00:00Z'),
      new Difference('form', 'tags', 'rent & shared', 'rent'),
      new Difference('form', 'extra', 'absent (not a field of this stub)', '1')
    ]);
  });

  it('reports a field the stub says must be absent', () => {
    const request = sampleRequests.settleAccount(...ledger.settleAccountForm, ['dry_run', 'true']);

    const differences = diff(sampleSuccess('settleAccount 200'), request);

    expect(differences).to.deep.equal([new Difference('form', 'dry_run', 'absent', 'true')]);
  });

  it('reports a field in another letter case as two fields: the one missing and the one unknown', () => {
    const fields = ledger.settleAccountForm.map(([name, value]): [string, string] => [
      name === 'note' ? 'Note' : name,
      value
    ]);

    const differences = diff(sampleSuccess('settleAccount 200'), sampleRequests.settleAccount(...fields));

    expect(differences).to.deep.equal([
      new Difference('form', 'note', 'Month end', 'absent'),
      new Difference('form', 'Note', 'absent (not a field of this stub)', 'Month end')
    ]);
  });
});

describe('differencesFrom, on a multipart body', () => {
  it('reports each of two wrong parts', () => {
    const differences = diff(sampleSuccess('uploadDocument 201'), sampleRequests.uploadDocument('wrong.pdf', 'Other'));

    expect(differences).to.deep.equal([
      new Difference('part', 'description', 'Monthly statement for February 2026', 'Other'),
      new Difference('part', 'file filename', 'statement-2026-02.pdf', 'wrong.pdf')
    ]);
  });

  it('reports a part the stub does not have', () => {
    const request = get().multipart([text('a', 'a'), text('b', 'b'), text('c', 'c')]);

    const differences = diff(only(successStub({ body: PARTS_A_AND_B })), request);

    expect(differences).to.deep.equal([new Difference('part', 'c', 'absent (not a part of this stub)', 'present')]);
  });

  it('reports a part that was not sent', () => {
    const differences = diff(only(successStub({ body: PARTS_A_AND_B })), get().multipart([text('a', 'a')]));

    expect(differences).to.deep.equal([new Difference('part', 'b', 'present', 'absent')]);
  });

  it('reports a body that is no multipart form at all, with what was sent instead', () => {
    const differences = diff(only(successStub({ body: PARTS_A_AND_B })), get().json('{}'));

    expect(differences).to.deep.equal([
      new Difference('body', '', 'multipart/form-data with a boundary', 'application/json')
    ]);
  });

  it('reports a text part sent in another charset as bytes that are not UTF-8', () => {
    const stub = withBody('{ "multipart": { "parts": { "note": { "text": "café" } } } }');

    const differences = diff(stub, get().multipart([text(Buffer.from('café', 'latin1'), 'note')]));

    expect(differences).to.deep.equal([new Difference('part', 'note', 'UTF-8 text', 'bytes that are not UTF-8')]);
  });

  for (const [title, files, expected] of [
    [
      'one of two repeated parts missing',
      ['statement-2026-01.pdf'],
      [new Difference('part', 'files', '2 part(s)', '1 part(s)')]
    ],
    [
      'one repeated part too many',
      ['statement-2026-01.pdf', 'statement-2026-02.pdf', 'statement-2026-03.pdf'],
      [new Difference('part', 'files', '2 part(s)', '3 part(s)')]
    ],
    [
      'the second repeated part wrong, by its position',
      ['statement-2026-01.pdf', 'wrong.pdf'],
      [new Difference('part', 'files[1] filename', 'statement-2026-02.pdf', 'wrong.pdf')]
    ],
    [
      'repeated parts in another order, by both positions',
      ['statement-2026-02.pdf', 'statement-2026-01.pdf'],
      [
        new Difference('part', 'files[0] filename', 'statement-2026-01.pdf', 'statement-2026-02.pdf'),
        new Difference('part', 'files[1] filename', 'statement-2026-02.pdf', 'statement-2026-01.pdf')
      ]
    ]
  ] as const) {
    it(`reports ${title}`, () => {
      const differences = diff(
        sampleSuccess('uploadStatements 201 two files'),
        sampleRequests.uploadStatements(...files)
      );

      expect(differences).to.deep.equal(expected);
    });
  }

  it("names a difference inside a part's JSON by the part and then the pointer, a slash in a key escaped", () => {
    const stub = withBody('{ "multipart": { "parts": { "meta": { "json": { "a/b": { "c": 1 } } } } } }');

    const differences = diff(stub, get().multipart([text('{"a/b":{"c":2}}', 'meta')]));

    expect(differences).to.deep.equal([new Difference('part', 'meta /a~1b/c', '1', '2')]);
  });

  it("names a difference at the root of a part's JSON by the part alone", () => {
    const stub = withBody('{ "multipart": { "parts": { "meta": { "json": { "a": 1 } } } } }');

    const differences = diff(stub, get().multipart([text('[1]', 'meta')]));

    expect(differences).to.deep.equal([new Difference('part', 'meta', '{"a":1}', '[1]')]);
  });
});

describe('answers', () => {
  for (const [title, request, expected] of [
    ['the request the stub describes', sampleRequests.createAccount(), true],
    ['another route, without reading its body', TestRequest.post('/v1/other').json('{not json'), false],
    ['the route with another body', sampleRequests.createAccount({ body: '{}' }), false],
    ['the route asked for another status', sampleRequests.createAccount().prefer('code=409'), false]
  ] as const) {
    it(`${expected ? 'answers' : 'does not answer'} ${title}`, () => {
      const result = answers(sampleSuccess('createAccount 201'), request.build());

      expect(result).to.equal(expected);
    });
  }
});
