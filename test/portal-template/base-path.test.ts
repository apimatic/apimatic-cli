import { expect } from 'chai';
import { withBasePath } from '../../portal-template/src/lib/base-path';

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
