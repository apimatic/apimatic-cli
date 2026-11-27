import { randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { readJson } from '../../../../src/types/mock/json/json-reader.js';
import { Difference } from '../../../../src/types/mock/matching/difference.js';
import { compareJson } from '../../../../src/types/mock/matching/json-diff.js';
import { verdictOf } from '../../../../src/types/mock/matching/verdict.js';
import { ledger, sampleRequests, TestRequest } from '../../../helpers/mock-requests.js';
import { sampleStubs, sampleSuccess } from '../../../helpers/mock-stubs.js';

/** What the closest stub reports for a request, each difference as `where name`. */
const differences = (request: TestRequest): readonly Difference[] => {
  const verdict = verdictOf(sampleStubs().endpoints, request.build());
  if (verdict.kind !== 'mismatch') {
    throw new Error(`The request was expected to miss, and the verdict is '${verdict.kind}'.`);
  }
  return verdict.closest.differences;
};
const places = (found: readonly Difference[]) => found.map(({ where, name }) => `${where} ${name}`.trimEnd());
const listAccounts = () => TestRequest.get('/v1/accounts').header('Accept', 'application/json').bearer();

// The seven ways an SDK can send the wrong thing on the wire; each must be named, not just refused.
describe('the wire mutations, without a server', () => {
  it('m1: names both keys of a renamed body key', () => {
    const request = sampleRequests.createAccount({
      body: ledger.createAccountBody.replace('credit_limit', 'creditLimit')
    });

    const found = differences(request);

    expect(places(found)).to.include.members(['body /credit_limit', 'body /creditLimit']);
  });

  it('m2: names another method', () => {
    const request = TestRequest.put('/v1/accounts')
      .header('Idempotency-Key', ledger.createAccountIdempotencyKey)
      .cookie('ledger_session', ledger.sessionCookie)
      .bearer(ledger.clientCredentialsToken)
      .json(ledger.createAccountBody);

    const found = differences(request);

    expect(places(found)).to.include('method');
  });

  it('m2: names a method sent in lower case', () => {
    const request = TestRequest.of('delete', `/v1/accounts/${ledger.accountA}`).bearer();

    const found = differences(request);

    expect(found).to.deep.equal([new Difference('method', '', 'DELETE', 'delete')]);
  });

  it('m3: names another path', () => {
    const request = TestRequest.delete(`/v1/account/${ledger.accountA}`).bearer();

    const found = differences(request);

    expect(places(found)).to.deep.equal(['path']);
  });

  it('m4: names the scheme of a dropped credential', () => {
    const request = TestRequest.delete(`/v1/accounts/${ledger.accountA}`);

    const found = differences(request);

    expect(places(found)).to.include('auth bearerAuth');
  });

  it('m5: names a renamed query parameter as one missing and one not expected', () => {
    const request = listAccounts().query('off', '1').query('tags', 'rent', 'shared').query('cursor', 'cur_7f3a');

    const found = differences(request);

    expect(places(found)).to.include.members(['query off', 'query offset']);
  });

  it('m5: names a dropped query parameter', () => {
    const request = listAccounts().query('offset', '1').query('cursor', 'cur_7f3a');

    const found = differences(request);

    expect(found).to.deep.include(new Difference('query', 'tags', 'rent & shared', 'absent'));
  });

  it('m5: names a changed query value', () => {
    const request = listAccounts().query('offset', '2').query('tags', 'rent', 'shared').query('cursor', 'cur_7f3a');

    const found = differences(request);

    expect(found).to.deep.include(new Difference('query', 'offset', '1', '2'));
  });

  it('m6: names both keys of a renamed response key, by comparing what was decoded with the example served', () => {
    const body = sampleSuccess('listAccounts 200 page 2').response.body;
    const example = body.kind === 'json' ? body.json : readJson('null')._unsafeUnwrap();
    const decoded = readJson('{"data":[],"hasMore":false,"total_count":42}')._unsafeUnwrap();

    const found = compareJson(example, decoded);

    expect(places(found)).to.include.members(['body /has_more', 'body /hasMore']);
  });

  it('m7: names a changed header value', () => {
    const request = sampleRequests.createAccount({ idempotencyKey: randomUUID() });

    const found = differences(request);

    expect(places(found)).to.include('header Idempotency-Key');
  });

  it('names a Money field sent as a number where the example has a string', () => {
    const request = sampleRequests.createAccount({ body: ledger.createAccountBody.replace('"1250.75"', '1250.75') });

    const found = differences(request);

    expect(found).to.deep.include(new Difference('body', '/credit_limit', '"1250.75"', '1250.75'));
  });
});
