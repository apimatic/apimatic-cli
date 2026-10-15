import { expect } from 'chai';
import PortalCopilotSync from '../../../../src/commands/portal/copilot/sync.js';
import { flagParser } from '../../flag-parser.js';

const { parse } = flagParser(PortalCopilotSync);

describe('portal copilot sync flags', () => {
  it('waits for indexing unless told not to', async () => {
    expect((await parse([])).flags.wait).to.be.true;
    expect((await parse(['--no-wait'])).flags.wait).to.be.false;
  });

  it('takes the project, the portal and the auth key by their short names', async () => {
    const { flags } = await parse(['-i', './project', '-d', './site', '-k', 'key']);

    expect(flags).to.include({ input: './project', destination: './site', 'auth-key': 'key' });
  });
});
