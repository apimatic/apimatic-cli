import { expect } from 'chai';
import PortalCopilotEnable from '../../../../src/commands/portal/copilot/enable.js';
import { flagParser } from '../../flag-parser.js';

const { parse } = flagParser(PortalCopilotEnable);

describe('portal copilot enable flags', () => {
  it('asks for a live key, kept as it is, for the site alone, by default', async () => {
    expect((await parse([])).flags).to.include({ dev: false, rotate: false });
    expect((await parse([])).flags.origin).to.deep.equal([]);
  });

  it('takes several sites, a development key and a new key', async () => {
    const { flags } = await parse([
      '--dev',
      '--rotate',
      '--origin',
      'https://staging.example.com',
      '--origin',
      'https://preview.example.com'
    ]);

    expect(flags).to.include({ dev: true, rotate: true });
    expect(flags.origin).to.deep.equal(['https://staging.example.com', 'https://preview.example.com']);
  });

  it('takes the project and the auth key by their short names', async () => {
    const { flags } = await parse(['-i', './project', '-k', 'key']);

    expect(flags).to.include({ input: './project', 'auth-key': 'key' });
  });
});
