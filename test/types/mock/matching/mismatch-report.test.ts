import { expect } from 'chai';
import { writeIndentedJson } from '../../../../src/types/mock/json/json-writer.js';
import { Difference } from '../../../../src/types/mock/matching/difference.js';
import {
  MISMATCH_HEADER_LIMIT,
  mismatchHeaderValue,
  mismatchReport,
  mismatchSummary
} from '../../../../src/types/mock/matching/mismatch-report.js';
import { Miss, verdictOf } from '../../../../src/types/mock/matching/verdict.js';
import { EndpointStub } from '../../../../src/types/mock/stub-format/stub.js';
import { ledger, sampleRequests, TestRequest } from '../../../helpers/mock-requests.js';
import { sampleStubs, stubsOf, successStub } from '../../../helpers/mock-stubs.js';

const missOf = (stubs: readonly EndpointStub[], request: TestRequest): Miss => {
  const verdict = verdictOf(stubs, request.build());
  if (verdict.kind === 'matched' || verdict.kind === 'served') {
    throw new Error('The request was expected to miss, and a stub answered it.');
  }
  return verdict;
};
const sampleMiss = (request: TestRequest) => missOf(sampleStubs().endpoints, request);
const written = (request: TestRequest, miss: Miss) => writeIndentedJson(mismatchReport(request.build(), miss));
const refused: Miss = {
  kind: 'rejected',
  what: 'OAuth2 token request',
  differences: [new Difference('form', 'refresh_token', 'ac-refresh-token-<n>', 'other')]
};

describe('mismatchReport', () => {
  it('names the closest stub and lists every difference', () => {
    const request = sampleRequests.listAccountsPage2().query('verbose', 'true');

    const report = written(request, sampleMiss(request));

    expect(report).to.equal(
      [
        '{',
        '  "type": "urn:mock-server:mismatch",',
        '  "status": 418,',
        '  "title": "No stub matches this request",',
        '  "detail": "Closest stub \'listAccounts 200 page 2\' differs; 1 difference(s) listed.",',
        '  "operation": "listAccounts",',
        '  "closest_stub": "listAccounts 200 page 2",',
        '  "request": "GET /v1/accounts?cursor=cur_7f3a&offset=1&tags=rent&tags=shared&verbose=true",',
        '  "differences": [',
        '    {',
        '      "where": "query",',
        '      "name": "verbose",',
        '      "expected": "absent (not a parameter of this stub)",',
        '      "actual": "true"',
        '    }',
        '  ]',
        '}'
      ].join('\n')
    );
  });

  it("repeats the closest stub's description, so a miss explains why the stub is as it is", () => {
    const stubs = stubsOf({
      's.json': successStub({ extraStub: '"description": "Synthesized from the schema; the spec has no example."' })
    });
    const request = TestRequest.get('/v1/x').query('extra', '1');

    const report = written(request, missOf(stubs.endpoints, request));

    expect(report).to.equal(
      [
        '{',
        '  "type": "urn:mock-server:mismatch",',
        '  "status": 418,',
        '  "title": "No stub matches this request",',
        '  "detail": "Closest stub \'s\' differs; 1 difference(s) listed.",',
        '  "operation": "op",',
        '  "closest_stub": "s",',
        '  "description": "Synthesized from the schema; the spec has no example.",',
        '  "request": "GET /v1/x?extra=1",',
        '  "differences": [',
        '    {',
        '      "where": "query",',
        '      "name": "extra",',
        '      "expected": "absent (not a parameter of this stub)",',
        '      "actual": "1"',
        '    }',
        '  ]',
        '}'
      ].join('\n')
    );
  });

  it('says no stubs are loaded, and names no closest stub', () => {
    const report = written(TestRequest.get('/v1/accounts'), { kind: 'noStubs' });

    expect(report).to.equal(
      [
        '{',
        '  "type": "urn:mock-server:mismatch",',
        '  "status": 418,',
        '  "title": "No stub matches this request",',
        '  "detail": "No stubs are loaded.",',
        '  "request": "GET /v1/accounts",',
        '  "differences": []',
        '}'
      ].join('\n')
    );
  });

  it('reports a refused OAuth2 request with its problems and no closest stub', () => {
    const report = written(TestRequest.post('/oauth2/token'), refused);

    expect(report).to.equal(
      [
        '{',
        '  "type": "urn:mock-server:mismatch",',
        '  "status": 418,',
        '  "title": "OAuth2 token request rejected",',
        '  "detail": "The OAuth2 token request has 1 problem(s).",',
        '  "request": "POST /oauth2/token",',
        '  "differences": [',
        '    {',
        '      "where": "form",',
        '      "name": "refresh_token",',
        '      "expected": "ac-refresh-token-<n>",',
        '      "actual": "other"',
        '    }',
        '  ]',
        '}'
      ].join('\n')
    );
  });
});

describe('mismatchSummary', () => {
  for (const [title, miss, summary] of [
    [
      'the closest stub and its differences',
      () => sampleMiss(sampleRequests.listAccountsPage2().query('verbose', 'true')),
      "closest 'listAccounts 200 page 2': query verbose: expected absent (not a parameter of this stub), got true"
    ],
    ['that no stubs are loaded', (): Miss => ({ kind: 'noStubs' }), 'no stubs loaded'],
    [
      'the field a refused OAuth2 request got wrong',
      () => refused,
      'OAuth2 token request rejected: form refresh_token: expected ac-refresh-token-<n>, got other'
    ]
  ] as const) {
    it(`says ${title} on one line`, () => {
      const line = mismatchSummary(miss());

      expect(line).to.equal(summary);
    });
  }
});

describe('mismatchHeaderValue', () => {
  it('escapes a character a header cannot carry to printable ASCII', () => {
    const miss = sampleMiss(sampleRequests.listAccountsPage2().query('q', '€'));

    const value = mismatchHeaderValue(miss);

    expect(value).to.equal(
      "closest 'listAccounts 200 page 2': query q: expected absent (not a parameter of this stub), got \\u20AC"
    );
  });

  it('escapes a character beyond the basic plane as its two code units', () => {
    const miss = sampleMiss(sampleRequests.listAccountsPage2().query('q', '😀'));

    const value = mismatchHeaderValue(miss);

    expect(value.endsWith('got \\uD83D\\uDE00')).to.be.true;
  });

  for (const [title, lineBreak] of [
    ['a line feed', '\\n'],
    ['a carriage return and a line feed', '\\r\\n'],
    ['a carriage return', '\\r']
  ]) {
    it(`puts a space where a difference holds ${title}`, () => {
      const stubs = stubsOf({ 't.json': successStub({ body: `"body": { "text": "first${lineBreak}second" }` }) });

      const value = mismatchHeaderValue(missOf(stubs.endpoints, TestRequest.get('/v1/x').text('other')));

      expect(value).to.equal("closest 's': body: expected first second, got other");
    });
  }

  it('cuts a long summary at the limit and marks the cut', () => {
    const extras = Array.from(
      { length: 20 },
      (_, index) => `"extra_${String(index).padStart(2, '0')}":"${'x'.repeat(100)}"`
    );
    const body = `${ledger.createAccountBody.slice(0, -1)},${extras.join(',')}}`;

    const value = mismatchHeaderValue(sampleMiss(sampleRequests.createAccount({ body })));

    expect(value).to.have.lengthOf(MISMATCH_HEADER_LIMIT + '...'.length);
    expect(value.endsWith('...')).to.be.true;
  });
});
