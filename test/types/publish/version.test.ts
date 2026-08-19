import { expect } from 'chai';
import { SemVersion } from '../../../src/types/publish/version';

describe('SemVersion', () => {
  describe('tryCreate', () => {
    for (const value of ['0.0.0', '1.2.3', '10.20.30']) {
      it(`accepts ${value}`, () => {
        const result = SemVersion.tryCreate(value);

        expect(result.isOk()).to.be.true;
        expect(result._unsafeUnwrap().toString()).to.equal(value);
      });
    }

    // Each of these was accepted while the parts were checked with `Number`, and would have been
    // written into plugin-config.json and the published package verbatim.
    for (const value of [' 1.2.3', '1.2.3 ', '1.2. 3', '1.2.Infinity', '1.2.1e3', '1.2.0x10', '1.2.+3']) {
      it(`rejects ${JSON.stringify(value)}`, () => {
        expect(SemVersion.tryCreate(value).isErr()).to.be.true;
      });
    }

    for (const value of ['', '1.2', '1.2.3.4', '1..3', '1.2.-3', '1.0.0-beta', 'v1.2.3']) {
      it(`rejects ${JSON.stringify(value)}`, () => {
        expect(SemVersion.tryCreate(value).isErr()).to.be.true;
      });
    }
  });
});
