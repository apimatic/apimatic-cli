import { expect } from 'chai';
import { Difference, ECHO_LIMIT } from '../../../../src/types/mock/matching/difference.js';

describe('Difference', () => {
  for (const [title, difference, line] of [
    [
      'a named difference with its place, its name and both sides',
      new Difference('query', 'offset', '1', '2'),
      'query offset: expected 1, got 2'
    ],
    [
      'a difference without a name with its place alone',
      new Difference('path', '', '/v1/accounts', '/v1/account'),
      'path: expected /v1/accounts, got /v1/account'
    ],
    [
      'an empty actual value as two quotes',
      new Difference('query', 'limit', 'absent (not a parameter of this stub)', ''),
      'query limit: expected absent (not a parameter of this stub), got ""'
    ],
    ['an empty expected value as two quotes', new Difference('body', '', '', 'other'), 'body: expected "", got other']
  ] as const) {
    it(`writes ${title}`, () => {
      const written = difference.toString();

      expect(written).to.equal(line);
    });
  }

  it('keeps a value at the echo limit whole', () => {
    const text = 'a'.repeat(ECHO_LIMIT);

    const difference = new Difference('body', text, text, text);

    expect([difference.name, difference.expected, difference.actual]).to.deep.equal([text, text, text]);
  });

  it('keeps the start of each value beyond the echo limit, and its length', () => {
    const text = 'a'.repeat(ECHO_LIMIT + 1);

    const difference = new Difference('form', text, text, text);

    const cut = `${'a'.repeat(ECHO_LIMIT)}... (10001 characters)`;
    expect([difference.name, difference.expected, difference.actual]).to.deep.equal([cut, cut, cut]);
  });

  it('keeps a surrogate pair whole where the cut would split it, since the report is JSON', () => {
    const text = `${'a'.repeat(ECHO_LIMIT - 1)}😀a`;

    const difference = new Difference('body', '', 'x', text);

    expect(difference.actual).to.equal(`${'a'.repeat(ECHO_LIMIT - 1)}... (${ECHO_LIMIT + 2} characters)`);
  });
});
