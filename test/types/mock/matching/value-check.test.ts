import { expect } from 'chai';
import { Difference } from '../../../../src/types/mock/matching/difference.js';
import { checkValue } from '../../../../src/types/mock/matching/value-check.js';
import { Instant } from '../../../../src/types/mock/stub-format/instant.js';
import { ValueRule } from '../../../../src/types/mock/stub-format/value-rule.js';

const NOON_TEXT = '2025-12-09T12:00:00Z';
const exact = (value: string): ValueRule => ({ kind: 'exact', value });
const startsWith = (prefix: string): ValueRule => ({ kind: 'startsWith', prefix });
const endsWith = (suffix: string): ValueRule => ({ kind: 'endsWith', suffix });
const contains = (fragment: string): ValueRule => ({ kind: 'contains', fragment });
const each = (...rules: ValueRule[]): ValueRule => ({ kind: 'each', rules });
const noon: ValueRule = { kind: 'dateTime', instant: Instant.parse(NOON_TEXT) as Instant };
const absent: ValueRule = { kind: 'absent' };
const any: ValueRule = { kind: 'any' };
const NOON = `a date-time equal to ${NOON_TEXT}`;

describe('checkValue', () => {
  for (const [title, rule, values] of [
    ['an exact value sent as written', exact('2'), ['2']],
    ['nothing sent where the name must be absent', absent, []],
    ['nothing sent where any value does', any, []],
    ['a value sent where any value does', any, ['x']],
    ['repeated values in the order of their rules', each(exact('rent'), exact('shared')), ['rent', 'shared']],
    ['a repeated value that meets the rule in its place', each(exact('rent'), startsWith('sh')), ['rent', 'shared']],
    ['a value with the prefix', startsWith('application/json'), ['application/json; charset=utf-8']],
    ['a value with the suffix', endsWith('.pdf'), ['statement.pdf']],
    ['a value with the fragment', contains('code='), ['respond-async, code=404']],
    ['a date-time in the same spelling', noon, [NOON_TEXT]],
    ['a date-time in another offset', noon, ['2025-12-09T13:00:00+01:00']],
    ['a date-time with a fraction and in lower case', noon, ['2025-12-09t12:00:00.000z']],
    ['a date-time as RFC 1123 writes it', noon, ['Tue, 09 Dec 2025 12:00:00 GMT']],
    ['a date-time as Unix seconds', noon, ['1765281600']]
  ] as const) {
    it(`finds no difference in ${title}`, () => {
      const differences = checkValue('header', 'X', rule, values);

      expect(differences).to.deep.equal([]);
    });
  }

  for (const [title, rule, values, expected, reported] of [
    ['another value', exact('2'), ['3'], '2', '3'],
    ['nothing sent for an exact value', exact('2'), [], '2', 'absent'],
    ['an exact value sent twice', exact('2'), ['2', '2'], '2', '2 & 2'],
    ['a value sent where the name must be absent', absent, ['x'], 'absent', 'x'],
    [
      'repeated values in another order',
      each(exact('rent'), exact('shared')),
      ['shared', 'rent'],
      'rent & shared',
      'shared & rent'
    ],
    ['one repeated value missing', each(exact('rent'), exact('shared')), ['rent'], 'rent & shared', 'rent'],
    ['one repeated value too many', each(exact('rent')), ['rent', 'rent'], 'rent', 'rent & rent'],
    [
      'a repeated value that breaks the rule in its place',
      each(exact('rent'), startsWith('sh')),
      ['rent', 'rent'],
      "rent & starting with 'sh'",
      'rent & rent'
    ],
    [
      'a value without the prefix',
      startsWith('application/json'),
      ['text/plain'],
      "starting with 'application/json'",
      'text/plain'
    ],
    [
      'a prefixed value sent twice',
      startsWith('Bearer '),
      ['Bearer x', 'Bearer y'],
      "starting with 'Bearer '",
      'Bearer x & Bearer y'
    ],
    ['the prefix in another letter case', startsWith('Bearer '), ['bearer x'], "starting with 'Bearer '", 'bearer x'],
    ['a value without the suffix', endsWith('.pdf'), ['statement.png'], "ending with '.pdf'", 'statement.png'],
    [
      'the suffix only inside the value',
      endsWith('.pdf'),
      ['statement.pdf.png'],
      "ending with '.pdf'",
      'statement.pdf.png'
    ],
    ['the suffix in another letter case', endsWith('.pdf'), ['STATEMENT.PDF'], "ending with '.pdf'", 'STATEMENT.PDF'],
    ['a suffixed value sent twice', endsWith('.pdf'), ['a.pdf', 'b.pdf'], "ending with '.pdf'", 'a.pdf & b.pdf'],
    ['a value without the fragment', contains('code='), ['respond-async'], "containing 'code='", 'respond-async'],
    ['the fragment in another letter case', contains('code='), ['CODE=404'], "containing 'code='", 'CODE=404'],
    [
      'a value with the fragment sent twice',
      contains('code='),
      ['code=404', 'code=500'],
      "containing 'code='",
      'code=404 & code=500'
    ],
    ['another instant', noon, ['2025-12-09T12:00:01Z'], NOON, '2025-12-09T12:00:01Z'],
    ['a value that is no instant', noon, ['noon'], NOON, 'noon'],
    ['nothing sent for a date-time', noon, [], NOON, 'absent'],
    ['a date-time sent twice', noon, [NOON_TEXT, NOON_TEXT], NOON, `${NOON_TEXT} & ${NOON_TEXT}`]
  ] as const) {
    it(`reports ${title} in the rule's own words`, () => {
      const differences = checkValue('header', 'X', rule, values);

      expect(differences).to.deep.equal([new Difference('header', 'X', expected, reported)]);
    });
  }

  it('names the place and the name the values were sent under', () => {
    const differences = checkValue('query', 'limit', absent, ['2']);

    expect(differences).to.deep.equal([new Difference('query', 'limit', 'absent', '2')]);
  });

  it('describes every item of a repeated rule', () => {
    const rule = each(exact('rent'), startsWith('sh'), noon);

    const differences = checkValue('query', 'tags', rule, ['rent']);

    expect(differences.map((difference) => difference.expected)).to.deep.equal([
      "rent & starting with 'sh' & a date-time equal to 2025-12-09T12:00:00Z"
    ]);
  });
});
