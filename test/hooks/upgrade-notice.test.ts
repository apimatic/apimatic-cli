import { expect } from 'chai';
import { upgradeNotice } from '../../src/hooks/upgrade-notice.js';

describe('upgradeNotice', () => {
  it("tells every user a newer CLI is available and what's new in v4", () => {
    const notice = upgradeNotice('24.12.0');

    expect(notice).to.contain("You're using an older version of the APIMatic CLI (v1).");
    expect(notice).to.contain('A newer version, CLI v2, is available.');
    expect(notice).to.contain('npm install -g @apimatic/cli@2');
    expect(notice).to.contain('https://docs.apimatic.io/v4/whats-new-in-v4');
  });

  it('asks for a Node.js upgrade before the install on a Node CLI v2 refuses', () => {
    const notice = upgradeNotice('22.23.2');

    expect(notice).to.contain('1. Upgrade Node.js from 22.23.2 to 24 or newer');
    expect(notice).to.contain('2. npm install -g @apimatic/cli@2');
  });

  it('leaves Node.js out on a Node CLI v2 runs on', () => {
    expect(upgradeNotice('24.0.0')).to.not.contain('Node.js');
    expect(upgradeNotice('26.1.0')).to.not.contain('Node.js');
  });

  it('fits every line in the 74 columns oclif leaves an 80-column log', () => {
    const lines = upgradeNotice('20.19.5').split('\n');

    expect(lines.map((line, i) => (i === 0 ? `Warning: ${line}` : line).length)).to.satisfy((lengths: number[]) =>
      lengths.every((length) => length <= 74)
    );
  });
});
