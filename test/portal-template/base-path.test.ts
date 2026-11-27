import { expect } from 'chai';
import { fullAddress, underBase, withBasePath } from '../../portal-template/src/lib/base-path';

describe('withBasePath', () => {
  // Outside Vite there is no `import.meta.env`, so the portal is taken to be at the root.
  it('leaves a path alone at the root', () => {
    expect(withBasePath('/guides/intro')).to.equal('/guides/intro');
    expect(withBasePath('/guides/intro', '/')).to.equal('/guides/intro');
  });

  it('puts a path under the base it is given', () => {
    expect(withBasePath('/guides/intro', '/docs/')).to.equal('/docs/guides/intro');
    expect(withBasePath('/', '/docs/')).to.equal('/docs/');
    expect(withBasePath('/api/search.json', '/api/')).to.equal('/api/api/search.json');
  });
});

describe('underBase', () => {
  // Already under the base or not, as the router reads a link's `/docs/llms.txt` too.
  it('puts a root-relative address under the base', () => {
    const written = ['/llms.txt', '/pricing', '/guides/intro.md', '/docs/llms.txt', '/llms.txt?v=1#top'];

    expect(written.map((address) => underBase(address, '/docs/'))).to.deep.equal([
      '/docs/llms.txt',
      '/docs/pricing',
      '/docs/guides/intro.md',
      '/docs/docs/llms.txt',
      '/docs/llms.txt?v=1#top'
    ]);
  });

  it('leaves any other address as written', () => {
    const written = [
      'https://example.com/llms.txt',
      '//cdn.example.com/llms.txt',
      'mailto:docs@example.com',
      'guides/intro',
      '#top'
    ];

    expect(written.map((address) => underBase(address, '/docs/'))).to.deep.equal(written);
  });
});

describe('fullAddress', () => {
  const global = globalThis as { window?: unknown };

  afterEach(() => {
    delete global.window;
  });

  it('is the path itself where there is no window, as in the prerender', () => {
    expect(fullAddress('/guides/intro.md')).to.equal('/guides/intro.md');
  });

  it('is the address the browser loaded the portal from, in the browser', () => {
    global.window = { location: { origin: 'https://docs.test' } };

    expect(fullAddress('/guides/intro.md')).to.equal('https://docs.test/guides/intro.md');
    expect(fullAddress('/')).to.equal('https://docs.test/');
  });
});
