import { expect } from 'chai';
import {
  LIFETIME_FROM_STUB,
  lifetimeOfSeconds,
  lifetimeOr
} from '../../../../src/types/mock/routing/token-lifetime.js';

describe('TokenLifetime', () => {
  for (const seconds of [0, -5, 1.5, Number.NaN]) {
    it(`refuses ${seconds} seconds, so expires_in never goes out below 1`, () => {
      const act = () => lifetimeOfSeconds(seconds);

      expect(act).to.throw(RangeError, `${seconds} is not`);
    });
  }

  for (const seconds of [1, 2_147_483_647]) {
    it(`keeps a lifetime of ${seconds} seconds`, () => {
      const lifetime = lifetimeOfSeconds(seconds);

      expect(lifetime).to.deep.equal({ kind: 'seconds', value: seconds });
    });
  }

  it("replaces the stub's own lifetime with the seconds it names", () => {
    const lifetime = lifetimeOfSeconds(60);

    const issued = lifetimeOr(lifetime, 3600);

    expect(issued).to.equal(60);
  });

  it("keeps the stub's own lifetime when it names none", () => {
    const issued = lifetimeOr(LIFETIME_FROM_STUB, 3600);

    expect(issued).to.equal(3600);
  });
});
