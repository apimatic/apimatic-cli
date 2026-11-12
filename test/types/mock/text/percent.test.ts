import { expect } from 'chai';
import { percentDecode, percentEncode } from '../../../../src/types/mock/text/percent.js';

describe('percentDecode', () => {
  for (const [encoded, decoded] of [
    ['plain', 'plain'],
    ['%41', 'A'],
    ['a%2Fb', 'a/b'],
    ['filter%5Bstatus%5D', 'filter[status]'],
    ['%C3%A9', 'é'],
    ['%c3%a9', 'é'],
    ['%F0%9F%98%80', '😀'],
    ['%EF%BB%BF', '\ufeff'],
    ['%00', '\u0000'],
    ['%2541', '%41'],
    ['a+b', 'a+b']
  ]) {
    it(`decodes '${encoded}'`, () => {
      const text = percentDecode(encoded);

      expect(text).to.equal(decoded);
    });
  }

  for (const [title, encoded, decoded] of [
    ['a percent sign alone', '%', '%'],
    ['an escape cut short', '%4', '%4'],
    ['an escape that is no hexadecimal', '%zz', '%zz'],
    ['a byte that is no UTF-8', '%E9', '%E9'],
    ['a byte that is no UTF-8 after a character that is', '%C3%A9%E9x', 'é%E9x'],
    ['an encoded surrogate', '%ED%A0%80', '%ED%A0%80'],
    ['an overlong encoding', '%C0%AF', '%C0%AF'],
    ['a sequence cut short, in its own letter case', '%e2%82', '%e2%82']
  ]) {
    it(`leaves ${title} as written, where decodeURIComponent throws`, () => {
      const text = percentDecode(encoded);

      expect(text).to.equal(decoded);
    });
  }
});

describe('percentEncode', () => {
  it('escapes everything but letters, digits and -._~, the marks encodeURIComponent leaves included', () => {
    const text = "ledger:write audit:read!'()*~-._ é😀/?#[]@";

    const encoded = percentEncode(text);

    expect(encoded).to.equal('ledger%3Awrite%20audit%3Aread%21%27%28%29%2A~-._%20%C3%A9%F0%9F%98%80%2F%3F%23%5B%5D%40');
  });

  it('is undone by percentDecode', () => {
    const text = 'a b&c=d%é/😀';

    const decoded = percentDecode(percentEncode(text));

    expect(decoded).to.equal(text);
  });
});
