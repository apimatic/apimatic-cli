import { expect } from 'chai';
import { fullAddress, withBasePath } from '../../portal-template/src/lib/base-path';

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
