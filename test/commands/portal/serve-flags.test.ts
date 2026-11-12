import { expect } from 'chai';
import PortalServe from '../../../src/commands/portal/serve.js';
import { flagParser } from '../flag-parser.js';

const { parse } = flagParser(PortalServe);

describe('portal serve flags', () => {
  it('accepts --no-analytics, off unless passed', async () => {
    const given = (await parse(['--no-analytics'])) as never as { flags: Record<string, unknown> };
    const omitted = (await parse([])) as never as { flags: Record<string, unknown> };

    expect(given.flags['no-analytics']).to.be.true;
    expect(omitted.flags['no-analytics']).to.be.false;
  });
});
