import { expect } from 'chai';
import { levenshtein } from '../../../../src/types/mock/text/text-distance.js';

describe('levenshtein', () => {
  for (const [first, second, distance] of [
    ['', '', 0],
    ['abc', 'abc', 0],
    ['', 'abc', 3],
    ['abc', '', 3],
    ['/v1/accounts', '/v1/account', 1],
    ['/v1/accounts', '/v1/acounts', 1],
    ['kitten', 'sitting', 3],
    ['flaw', 'lawn', 2],
    ['saturday', 'sunday', 3]
  ] as const) {
    it(`counts ${distance} edit(s) from '${first}' to '${second}'`, () => {
      const edits = levenshtein(first, second);

      expect(edits).to.equal(distance);
    });
  }
});
