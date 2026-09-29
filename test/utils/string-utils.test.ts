import { performance } from 'node:perf_hooks';
import { expect } from 'chai';
import { withoutTrailingSlashes } from '../../src/utils/string-utils.js';

describe('withoutTrailingSlashes', () => {
  it('drops every trailing slash and nothing else', () => {
    expect(withoutTrailingSlashes('/docs/')).to.equal('/docs');
    expect(withoutTrailingSlashes('/docs///')).to.equal('/docs');
    expect(withoutTrailingSlashes('/docs')).to.equal('/docs');
    expect(withoutTrailingSlashes('/a/b/')).to.equal('/a/b');
  });

  it('leaves a root, and nothing at all, empty', () => {
    expect(withoutTrailingSlashes('/')).to.equal('');
    expect(withoutTrailingSlashes('///')).to.equal('');
    expect(withoutTrailingSlashes('')).to.equal('');
  });

  // The regex it replaces, /\/+$/, retried from every slash and went quadratic here.
  it('stays linear over a long run of slashes', () => {
    const input = '/'.repeat(200_000) + 'a';
    const started = performance.now();
    expect(withoutTrailingSlashes(input)).to.equal(input);
    expect(performance.now() - started).to.be.below(100);
  });
});
