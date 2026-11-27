import { expect } from 'chai';
import { asciiUpperCase, equalsIgnoringAsciiCase } from '../../../../src/types/mock/text/ascii.js';

describe('asciiUpperCase', () => {
  it('folds the letters a to z and nothing else', () => {
    const text = 'content-Type_1 ßéi';

    const folded = asciiUpperCase(text);

    expect(folded).to.equal('CONTENT-TYPE_1 ßéI');
  });
});

describe('equalsIgnoringAsciiCase', () => {
  for (const [first, second, equal] of [
    ['Bearer', 'bearer', true],
    ['CONTENT-TYPE', 'content-type', true],
    ['', '', true],
    ['code', 'encode', false],
    ['é', 'É', false],
    ['ß', 'SS', false]
  ] as const) {
    it(`finds '${first}' and '${second}' ${equal ? 'equal' : 'different'}`, () => {
      const result = equalsIgnoringAsciiCase(first, second);

      expect(result).to.equal(equal);
    });
  }
});
