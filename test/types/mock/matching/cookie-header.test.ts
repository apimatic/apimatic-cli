import { expect } from 'chai';
import { parseCookies } from '../../../../src/types/mock/matching/cookie-header.js';

describe('parseCookies', () => {
  for (const [title, headers, cookies] of [
    [
      'reads every pair of one header',
      ['ledger_session=sess_7f3a; theme=dark'],
      { ledger_session: ['sess_7f3a'], theme: ['dark'] }
    ],
    [
      'keeps every value of a repeated name, in the order sent',
      ['a=1; a=2', 'a=3; b=4'],
      { a: ['1', '2', '3'], b: ['4'] }
    ],
    ['keeps an equals sign inside a value', ['token=abc=def'], { token: ['abc=def'] }],
    ['skips a fragment without a name or without a value', ['novalue; =anonymous; ok=1; ;'], { ok: ['1'] }],
    ['keeps an empty value', ['empty='], { empty: [''] }],
    ['reads no cookies without a header', [], {}]
  ] as const) {
    it(title, () => {
      const read = parseCookies(headers);

      expect(Object.fromEntries(read)).to.deep.equal(cookies);
    });
  }
});
