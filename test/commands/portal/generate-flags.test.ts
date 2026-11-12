import { expect } from 'chai';
import PortalGenerate from '../../../src/commands/portal/generate.js';
import { flagParser } from '../flag-parser.js';

const { parse } = flagParser(PortalGenerate);

describe('portal generate flags', () => {
  it('accepts --no-analytics, off unless passed', async () => {
    const given = (await parse(['--no-analytics'])) as never as { flags: Record<string, unknown> };
    const omitted = (await parse([])) as never as { flags: Record<string, unknown> };

    expect(given.flags['no-analytics']).to.be.true;
    expect(omitted.flags['no-analytics']).to.be.false;
  });
});
