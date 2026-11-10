import { expect } from 'chai';
import { sameNumber, wholeNumberText } from '../../../../src/types/mock/json/json-number.js';

describe('sameNumber', () => {
  for (const [first, second] of [
    ['1', '1'],
    ['1.0', '1'],
    ['100', '1e2'],
    ['10', '1e1'],
    ['1e30', '1E30'],
    ['1e30', '1e+30'],
    ['1e30', '1.0E30'],
    ['0.0012', '12e-4'],
    ['-120.50e1', '-1205'],
    ['-1205', '-0.1205E+4'],
    ['-0', '0'],
    ['0.0', '-0e5'],
    ['1e99999999999999999999', '10e99999999999999999998']
  ]) {
    it(`reads ${first} and ${second} as one value`, () => {
      const same = sameNumber(first, second);

      expect(same).to.be.true;
    });
  }

  for (const [first, second] of [
    ['9007199254740993', '9007199254740992'],
    ['1e-30', '0'],
    ['1e-30', '2e-30'],
    ['0.12345678901234567890123456789', '0.12345678901234567890123456788'],
    ['3.1415926535897932384626433832795', '3.1415926535897932384626433832796'],
    ['1e30', '2e30'],
    ['1e30', '1e31'],
    ['-1', '1'],
    ['1e99999999999999999999', '1e99999999999999999998']
  ]) {
    it(`keeps ${first} apart from ${second}`, () => {
      const same = sameNumber(first, second);

      expect(same).to.be.false;
    });
  }
});

describe('wholeNumberText', () => {
  for (const [number, digits] of [
    ['200', '200'],
    ['200.0', '200'],
    ['2e2', '200'],
    ['20.0E1', '200'],
    ['1.7672256e9', '1767225600'],
    ['-1.0', '-1'],
    ['0', '0'],
    ['-0.0', '0'],
    ['0e5', '0'],
    ['9007199254740993', '9007199254740993'],
    ['1e27', '1' + '0'.repeat(27)]
  ]) {
    it(`reads ${number} as the whole number ${digits}`, () => {
      const written = wholeNumberText(number);

      expect(written).to.equal(digits);
    });
  }

  for (const number of ['200.5', '1e-1', '0.001', '1767225600.25', '1e28', '1e400']) {
    it(`reads no whole number in ${number}`, () => {
      const written = wholeNumberText(number);

      expect(written).to.be.undefined;
    });
  }
});
