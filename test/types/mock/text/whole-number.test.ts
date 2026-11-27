import { expect } from 'chai';
import { wholeNumber } from '../../../../src/types/mock/text/whole-number.js';

describe('wholeNumber', () => {
  for (const [text, value] of [
    ['404', 404],
    ['0', 0],
    ['0404', 404],
    ['2147483647', 2147483647]
  ] as const) {
    it(`reads '${text}' as ${value}`, () => {
      const number = wholeNumber(text);

      expect(number).to.equal(value);
    });
  }

  for (const text of [
    '',
    '+404',
    '-1',
    ' 404',
    '404 ',
    '404abc',
    '4.0',
    '4e2',
    '0x10',
    '٣',
    '2147483648',
    '99999999999999999999'
  ]) {
    it(`reads no number in '${text}', where parseInt or Number would`, () => {
      const number = wholeNumber(text);

      expect(number).to.be.undefined;
    });
  }
});
