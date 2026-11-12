import { expect } from 'chai';
import { parseForm, parseQuery } from '../../../../src/types/mock/matching/query-string.js';

describe('parseQuery', () => {
  for (const [title, raw, pairs] of [
    [
      'decodes keys and values and keeps a repeated key as separate pairs',
      '?filter%5Bstatus%5D=active&q=cash%20flow&tags=rent&tags=shared',
      [
        ['filter[status]', 'active'],
        ['q', 'cash flow'],
        ['tags', 'rent'],
        ['tags', 'shared']
      ]
    ],
    [
      'gives a key without a value an empty one',
      'flag&empty=',
      [
        ['flag', ''],
        ['empty', '']
      ]
    ],
    [
      'reads a plus as a space and an encoded plus as a plus',
      'scope=ledger%3Aread+audit%3Aread&q=a%2Bb&a+key=x',
      [
        ['scope', 'ledger:read audit:read'],
        ['q', 'a+b'],
        ['a key', 'x']
      ]
    ],
    ['keeps the second of two question marks in the key', '??offset=1', [['?offset', '1']]],
    ['keeps an equals sign inside a value', 'filter=a=b', [['filter', 'a=b']]],
    [
      'leaves an escape that is none as written, rather than failing the request',
      'q=100%&r=%zz',
      [
        ['q', '100%'],
        ['r', '%zz']
      ]
    ],
    ['reads no pairs in an empty query', '', []],
    ['reads no pairs in a question mark alone', '?', []],
    ['reads no pairs between ampersands', '&&', []]
  ] as const) {
    it(title, () => {
      const read = parseQuery(raw);

      expect(read).to.deep.equal(pairs);
    });
  }
});

describe('parseForm', () => {
  it('keeps a leading question mark in the first name, as a strict server reads a form', () => {
    const encoded = '?grant_type=client_credentials&scope=a';

    const read = parseForm(encoded);

    expect(read).to.deep.equal([
      ['?grant_type', 'client_credentials'],
      ['scope', 'a']
    ]);
  });
});
