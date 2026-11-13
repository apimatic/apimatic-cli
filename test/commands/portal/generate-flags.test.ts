import { expect } from 'chai';
import PortalGenerate from '../../../src/commands/portal/generate.js';
import { buildOptionsOf } from './build-options.js';

describe('portal generate flags', () => {
  it('reads the source without the vendor tags under --no-analytics, and with them otherwise', async () => {
    expect(await buildOptionsOf(PortalGenerate, ['--no-analytics'])).to.deep.equal({ analytics: false });
    expect(await buildOptionsOf(PortalGenerate, [])).to.deep.equal({ analytics: true });
  });
});
