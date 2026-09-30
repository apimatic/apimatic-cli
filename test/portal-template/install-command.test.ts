import { expect } from 'chai';
import { installCommand } from '../../portal-template/src/lib/install-command';

describe('installCommand', () => {
  it('prefixes a path on the portal with the address the portal is served at', () => {
    expect(installCommand('/__downloads/plugin.zip', 'https://docs.acme.test')).to.equal(
      'npx context-plugins install "https://docs.acme.test/__downloads/plugin.zip"'
    );
  });

  it('joins them with one slash whatever either side carries', () => {
    expect(installCommand('__downloads/plugin.zip', 'https://docs.acme.test/')).to.equal(
      'npx context-plugins install "https://docs.acme.test/__downloads/plugin.zip"'
    );
  });

  // The browser's own address ends in a slash, and a configured one does not.
  it('keeps the path a portal is served under, either way it is written', () => {
    for (const site of ['https://acme.github.io/docs', 'https://acme.github.io/docs/']) {
      expect(installCommand('/__downloads/plugin.zip', site), site).to.equal(
        'npx context-plugins install "https://acme.github.io/docs/__downloads/plugin.zip"'
      );
    }
  });

  it('leaves an address elsewhere as it is', () => {
    expect(installCommand('https://plugins.acme.test/calc.zip', 'https://docs.acme.test')).to.equal(
      'npx context-plugins install "https://plugins.acme.test/calc.zip"'
    );
  });

  // Prerendered with no configured address: the browser supplies its address once the page loads.
  it('leaves the path as it is when the address is not known', () => {
    expect(installCommand('/__downloads/plugin.zip', null)).to.equal(
      'npx context-plugins install "/__downloads/plugin.zip"'
    );
  });

  // Unquoted, a shell would run everything after the `&` as a second command.
  it('keeps an address with several query parameters one argument', () => {
    expect(installCommand('https://s3.test/calc.zip?X-Amz-Credential=a&X-Amz-Signature=b', null)).to.equal(
      'npx context-plugins install "https://s3.test/calc.zip?X-Amz-Credential=a&X-Amz-Signature=b"'
    );
  });
});
