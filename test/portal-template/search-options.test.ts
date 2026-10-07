import { expect } from 'chai';

describe('the query the router reads and writes', () => {
  // Under a base path the router puts back on load what these give it; TanStack's JSON default made the state a float.
  it('gives back the query an OAuth provider returns, as it was written', async () => {
    const { searchOptions } = await import('../../portal-template/src/lib/search-options');
    const query = '?code=probe-code&state=339416824538556760932965154722860613397&v=1.0&page=2&debug=true';

    expect(searchOptions.parseSearch(query)).to.include({ state: '339416824538556760932965154722860613397', v: '1.0' });
    expect(searchOptions.stringifySearch(searchOptions.parseSearch(query))).to.equal(query);
  });
});
