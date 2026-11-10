import { expect } from 'chai';
import { rankStubs } from '../../../../src/types/mock/matching/closest-stub.js';
import { Difference } from '../../../../src/types/mock/matching/difference.js';
import { EndpointStub } from '../../../../src/types/mock/stub-format/stub.js';
import { ledger, TestRequest } from '../../../helpers/mock-requests.js';
import {
  errorStub,
  sampleError,
  sampleStubs,
  sampleSuccess,
  stubsOf,
  successStub
} from '../../../helpers/mock-stubs.js';

const NOT_A_PARAMETER = 'absent (not a parameter of this stub)';
const samples = (): readonly EndpointStub[] => sampleStubs().endpoints;
const endpoints = (files: Record<string, string>): readonly EndpointStub[] => stubsOf(files).endpoints;
const closest = (stubs: readonly EndpointStub[], request: TestRequest) => {
  const [first] = rankStubs(stubs, request.build());
  return [first.stub.name, first.differences];
};
const transactionsOf = (account: string) => TestRequest.get(`/v1/accounts/${account}/transactions`);

describe('rankStubs', () => {
  it('puts the nearest path first for a mistyped one', () => {
    const request = TestRequest.delete(`/v1/account/${ledger.accountA}`).bearer();

    const first = closest(samples(), request);

    expect(first).to.deep.equal([
      'deleteAccount 204',
      [new Difference('path', '', `/v1/accounts/${ledger.accountA}`, `/v1/account/${ledger.accountA}`)]
    ]);
  });

  it('puts the nearer spelling of a misspelt path first', () => {
    const stubs = endpoints({
      'a.json': successStub({ name: 'far', path: '/v1/transfers' }),
      'b.json': successStub({ name: 'near', path: '/v1/accounts' })
    });

    const [name] = closest(stubs, TestRequest.get('/v1/acounts'));

    expect(name).to.equal('near');
  });

  it('puts the same path under another method above another path', () => {
    const [first] = rankStubs(samples(), TestRequest.put('/v1/accounts').bearer().build());

    expect(first.stub.route.path.toString()).to.equal('/v1/accounts');
    expect(first.differences.map(({ where }) => where)).to.include('method');
  });

  it('weighs another path far above everything else', () => {
    const [candidate] = rankStubs([sampleSuccess('deleteAccount 204')], TestRequest.get('/v1/nowhere').build());

    expect(candidate.distance).to.be.greaterThan(150);
  });

  it('puts a success stub above an error stub the request did not ask for', () => {
    const stubs = [sampleError('getAccount 404'), sampleSuccess('deleteAccount 204')];

    const [name] = closest(stubs, TestRequest.delete(`/v1/accounts/${ledger.accountA}`));

    expect(name).to.equal('deleteAccount 204');
  });

  it("puts a success stub on the request's path first, beside an unrequested error stub, whatever it weighs", () => {
    const stubs = endpoints({
      'a.json': successStub({
        name: 'delete 204',
        method: 'DELETE',
        operation: 'delete',
        extraRequest: '"query": { "a": "1", "b": "2", "c": "3" }',
        response: '{ "status": 204 }'
      }),
      'b.json': errorStub({ name: 'get 404', operation: 'get', path: '/v1/x' })
    });

    const [name] = closest(stubs, TestRequest.put('/v1/x'));

    expect(name).to.equal('delete 204');
  });

  it('puts the stub with fewer differences first among stubs of equal weight', () => {
    const stubs = endpoints({
      'a.json': successStub({ name: 'first', extraRequest: '"query": { "a": "1", "b": "1" }' }),
      'b.json': successStub({ name: 'second', extraRequest: '"query": { "b": "2" }' })
    });

    const first = closest(stubs, TestRequest.get('/v1/x').query('a', '2').query('b', '2'));

    expect(first).to.deep.equal(['second', [new Difference('query', 'a', NOT_A_PARAMETER, '2')]]);
  });

  it('puts the success stub first among stubs of equal weight and as many differences', () => {
    const stubs = endpoints({
      'a.json': errorStub({ name: 'error', path: '/v1/x' }),
      'b.json': successStub({ name: 'success' })
    });

    const ranked = rankStubs(stubs, TestRequest.get('/v1/x').prefer('code=500').build());

    expect(ranked.map((candidate) => [candidate.stub.name, candidate.distance])).to.deep.equal([
      ['success', 1],
      ['error', 1]
    ]);
  });

  it('keeps file order among stubs that rank alike', () => {
    const stubs = endpoints({
      'a.json': successStub({ name: 'first', path: '/v1/a' }),
      'b.json': successStub({ name: 'second', path: '/v1/b' })
    });

    const ranked = rankStubs(stubs, TestRequest.get('/v1/c').build());

    expect(ranked.map((candidate) => candidate.stub.name)).to.deep.equal(['first', 'second']);
  });

  it("reports another identifier as the path of the success stub, not as a missing Prefer on the error stub's template", () => {
    const request = transactionsOf(ledger.accountB).header('Accept', 'application/json').bearer();

    const first = closest(samples(), request);

    expect(first).to.deep.equal([
      'listTransactions 200 firstPage',
      [
        new Difference(
          'path',
          '',
          `/v1/accounts/${ledger.accountA}/transactions`,
          `/v1/accounts/${ledger.accountB}/transactions`
        )
      ]
    ]);
  });

  it('does so too when the request asks for the success status', () => {
    const request = transactionsOf(ledger.accountB).header('Accept', 'application/json').bearer().prefer('code=200');

    const [name] = closest(samples(), request);

    expect(name).to.equal('listTransactions 200 firstPage');
  });

  it('puts a success stub with ten differences above the unrequested error stub of its operation', () => {
    const stubs = endpoints({ 'a.json': successStub({ name: 'success' }), 'b.json': errorStub({ name: 'error' }) });
    const request = Array.from({ length: 10 }, (_, index) => `k${index}`).reduce(
      (built, key) => built.query(key, 'v'),
      TestRequest.get('/v1/x')
    );

    const [name] = closest(stubs, request);

    expect(name).to.equal('success');
  });

  it('puts the error stub first for an operation that has no success stub', () => {
    const first = closest(samples(), TestRequest.get(`/v1/accounts/${ledger.accountB}`).bearer());

    expect(first).to.deep.equal(['getAccount 404', [new Difference('header', 'Prefer', 'code=404', 'absent')]]);
  });

  it('puts the error stub first for a request that asks for an error it does not declare', () => {
    const stubs = endpoints({ 'a.json': successStub({ name: 'success' }), 'b.json': errorStub({ name: 'error' }) });

    const first = closest(stubs, TestRequest.get('/v1/x').query('a', '1').prefer('code=403'));

    expect(first).to.deep.equal(['error', [new Difference('header', 'Prefer', 'code=404', 'code=403')]]);
  });

  it("puts a literal sibling route's success stub first, ahead of the template it also fits", () => {
    const stubs = endpoints({
      'a.json': successStub({ name: 'search', path: '/v1/search', operation: 'search' }),
      'b.json': successStub({ name: 'get 200', path: '/v1/1', operation: 'get' }),
      'c.json': errorStub({ name: 'get 404', operation: 'get' })
    });

    const [name] = closest(stubs, TestRequest.get('/v1/search').query('a', '1').query('b', '2').prefer('code=200'));

    expect(name).to.equal('search');
  });

  it('puts the stub of the example asked for first, whatever else differs there', () => {
    const request = transactionsOf(ledger.accountA).bearer().prefer('example=noItems');

    const [first] = rankStubs(samples(), request.build());

    expect(first.stub.name).to.equal('listTransactions 200 noItems');
    expect(first.differences.map(({ where, name }) => `${where} ${name}`)).to.include('header Accept');
  });

  for (const [title, firstPageQuery] of [
    ['leaves the key out', ''],
    ['declares the key null', '"query": { "offset": null }'],
    ['declares the key absent', '"query": { "offset": { "absent": true } }']
  ]) {
    it(`reports a changed value against the stub that takes the key, when the other ${title}`, () => {
      const stubs = endpoints({
        'a.json': successStub({ name: 'page 1', extraRequest: firstPageQuery }),
        'b.json': successStub({ name: 'page 2', extraRequest: '"query": { "offset": "1" }' })
      });

      const first = closest(stubs, TestRequest.get('/v1/x').query('offset', '2'));

      expect(first).to.deep.equal(['page 2', [new Difference('query', 'offset', '1', '2')]]);
    });
  }

  it("weighs a success stub's own Prefer rule as any other header", () => {
    const stubs = endpoints({
      'a.json': successStub({ name: 'other', extraRequest: '"query": { "a": "1", "b": "2", "c": "3" }' }),
      'b.json': successStub({ name: 'with prefer', headers: '"Prefer": "return=representation"' })
    });

    const first = closest(stubs, TestRequest.get('/v1/x'));

    expect(first).to.deep.equal([
      'with prefer',
      [new Difference('header', 'Prefer', 'return=representation', 'absent')]
    ]);
  });

  it('ranks nothing when there are no stubs', () => {
    const ranked = rankStubs([], TestRequest.get('/v1/x').build());

    expect(ranked).to.deep.equal([]);
  });
});
