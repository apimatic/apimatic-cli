import { expect } from 'chai';
import { Difference } from '../../../../src/types/mock/matching/difference.js';
import { isAnswer, responseOn, Verdict, verdictOf } from '../../../../src/types/mock/matching/verdict.js';
import { sampleRequests, TestRequest } from '../../../helpers/mock-requests.js';
import { errorStub, sampleStubs, sampleSuccess, stubsOf, successStub } from '../../../helpers/mock-stubs.js';

const ofSamples = (request: TestRequest): Verdict => verdictOf(sampleStubs().endpoints, request.build());
const matched = (verdict: Verdict) => (verdict.kind === 'matched' ? verdict.stub.name : verdict.kind);
const closest = (verdict: Verdict) =>
  verdict.kind === 'mismatch' ? [verdict.closest.stub.name, verdict.closest.differences] : [verdict.kind];

describe('verdictOf', () => {
  it('answers a request with the stub that matches it', () => {
    const verdict = ofSamples(sampleRequests.listAccountsPage2());

    expect(verdict).to.deep.equal({ kind: 'matched', stub: sampleSuccess('listAccounts 200 page 2') });
  });

  it('explains the closest stub when none matches', () => {
    const verdict = ofSamples(sampleRequests.listAccountsPage2().query('verbose', 'true'));

    expect(closest(verdict)).to.deep.equal([
      'listAccounts 200 page 2',
      [new Difference('query', 'verbose', 'absent (not a parameter of this stub)', 'true')]
    ]);
  });

  it('picks the first of two matching stubs in file order', () => {
    const stubs = stubsOf({ 'a.json': successStub({ name: 'first' }), 'b.json': successStub({ name: 'second' }) });

    const verdict = verdictOf(stubs.endpoints, TestRequest.get('/v1/x').build());

    expect(matched(verdict)).to.equal('first');
  });

  it('serves the error stub asked for, although the success stub before it could not read the body', () => {
    const stubs = stubsOf({
      'a.json': successStub({ body: '"body": { "json": { "m": "x" } }' }),
      'b.json': errorStub()
    });
    const request = TestRequest.get('/v1/x').prefer('code=404').json('{"m":"\\ud83d"}');

    const verdict = verdictOf(stubs.endpoints, request.build());

    expect(matched(verdict)).to.equal('e');
  });

  it('says there are no stubs when there are none', () => {
    const verdict = verdictOf([], TestRequest.get('/v1/accounts').build());

    expect(verdict).to.deep.equal({ kind: 'noStubs' });
  });

  it('picks the stub of the example asked for', () => {
    const verdict = ofSamples(sampleRequests.listTransactions().prefer('example=noItems'));

    expect(matched(verdict)).to.equal('listTransactions 200 noItems');
  });

  it('picks the first stub in file order when no example is asked for', () => {
    const verdict = ofSamples(sampleRequests.listTransactions());

    expect(matched(verdict)).to.equal('listTransactions 200 firstPage');
  });

  it('explains the closest stub when the example asked for is not one', () => {
    const verdict = ofSamples(sampleRequests.listTransactions().prefer('example=nope'));

    expect(closest(verdict)).to.deep.equal([
      'listTransactions 200 firstPage',
      [new Difference('header', 'Prefer', 'example=firstPage', 'example=nope')]
    ]);
  });
});

describe('responseOn', () => {
  it("resolves the origin in a matched stub's headers", () => {
    const verdict = ofSamples(sampleRequests.createAccount());

    const response = isAnswer(verdict) ? responseOn(verdict, 'http://localhost:4010') : undefined;

    expect(response?.headers.find((header) => header.name === 'Location')?.value).to.equal(
      'http://localhost:4010/v1/accounts/7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d'
    );
  });

  it('sends what the OAuth2 server composed as it is, a placeholder the client sent included', () => {
    const response = {
      status: 302,
      headers: [{ name: 'Location', value: '{{origin}}/callback?code=c' }],
      body: { kind: 'empty' }
    } as const;

    const sent = responseOn({ kind: 'served', response }, 'http://localhost:4010');

    expect(sent).to.equal(response);
  });
});
