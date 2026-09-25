import { expect } from 'chai';
import { installAddress } from '../../portal-template/src/lib/install-address';

describe('installAddress', () => {
  it('prefixes a path on the portal with the origin it is served at', () => {
    expect(installAddress('/__downloads/plugin.zip', 'https://docs.acme.test')).to.equal(
      'https://docs.acme.test/__downloads/plugin.zip'
    );
  });

  it('joins them with one slash whatever either side carries', () => {
    expect(installAddress('__downloads/plugin.zip', 'https://docs.acme.test/')).to.equal(
      'https://docs.acme.test/__downloads/plugin.zip'
    );
  });

  it('leaves an address elsewhere as it is', () => {
    expect(installAddress('https://plugins.acme.test/calc.zip', 'https://docs.acme.test')).to.equal(
      'https://plugins.acme.test/calc.zip'
    );
  });

  // Prerendered with no configured address: the browser supplies the origin once the page loads.
  it('leaves the path as it is when the origin is not known', () => {
    expect(installAddress('/__downloads/plugin.zip', null)).to.equal('/__downloads/plugin.zip');
  });
});
