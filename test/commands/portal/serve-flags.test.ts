import { expect } from 'chai';
import PortalServe from '../../../src/commands/portal/serve.js';
import { buildOptionsOf } from './build-options.js';

describe('portal serve flags', () => {
  it('reads the source without the vendor tags under --no-analytics, and with them otherwise', async () => {
    expect(await buildOptionsOf(PortalServe, ['--no-analytics'])).to.deep.equal({ analytics: false });
    expect(await buildOptionsOf(PortalServe, [])).to.deep.equal({ analytics: true });
  });
});
