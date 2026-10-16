import { expect } from 'chai';
import { servedSearch, servedSources, servedUrl } from '../../portal-template/src/lib/copilot-links';

describe("the Ask AI chat's links", () => {
  it("puts a portal page's path under the base path the host serves it at", () => {
    expect(servedUrl('/guides/intro', '/docs/')).to.equal('/docs/guides/intro');
    expect(servedUrl('/', '/docs/')).to.equal('/docs/');
    expect(servedUrl('/guides/intro')).to.equal('/guides/intro');
  });

  it('leaves a full address, or one on another host, as it is', () => {
    expect(servedUrl('https://docs.example.com/guides/intro', '/docs/')).to.equal(
      'https://docs.example.com/guides/intro'
    );
    expect(servedUrl('//cdn.example.com/page', '/docs/')).to.equal('//cdn.example.com/page');
  });

  it('links each source chip under the base path, keeping its title and label', () => {
    const sources = [
      { url: '/guides/auth', title: 'Authentication', label: '1' },
      { url: 'https://status.example.com', title: 'Status' }
    ];

    expect(servedSources(sources, '/docs/')).to.deep.equal([
      { url: '/docs/guides/auth', title: 'Authentication', label: '1' },
      { url: 'https://status.example.com', title: 'Status' }
    ]);
  });

  it("links a search's found pages under the base path, keeping the rest of the search", () => {
    const part = {
      type: 'tool-search',
      state: 'output-available',
      input: { query: 'auth' },
      output: [{ doc: { url: '/guides/auth', title: 'Authentication' } }, { doc: null }]
    };

    expect(servedSearch(part, '/docs/')).to.deep.equal({
      ...part,
      output: [{ doc: { url: '/docs/guides/auth', title: 'Authentication' } }, { doc: null }]
    });
  });

  it('leaves a search that has found nothing yet as it is', () => {
    const running = { type: 'tool-search', state: 'input-streaming', output: undefined };

    expect(servedSearch(running, '/docs/')).to.deep.equal(running);
  });
});
