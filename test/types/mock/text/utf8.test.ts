import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { decodeUtf8 } from '../../../../src/types/mock/text/utf8.js';

describe('decodeUtf8', () => {
  it('reads UTF-8 text', () => {
    const bytes = Buffer.from('José 😀', 'utf8');

    const text = decodeUtf8(bytes);

    expect(text).to.equal('José 😀');
  });

  it('keeps a byte-order mark as the character it is', () => {
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x61]);

    const text = decodeUtf8(bytes);

    expect(text).to.equal('\ufeffa');
  });

  for (const [title, bytes] of [
    ['Latin-1 text', Buffer.from('José', 'latin1')],
    ['a sequence cut short', Buffer.from([0xe2, 0x82])],
    ['an encoded surrogate', Buffer.from([0xed, 0xa0, 0x80])]
  ] as const) {
    it(`reads nothing in ${title}, rather than replacement characters`, () => {
      const text = decodeUtf8(bytes);

      expect(text).to.be.undefined;
    });
  }
});
