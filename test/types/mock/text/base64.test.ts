import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { decodeBase64, decodeBase64Url, encodeBase64Url } from '../../../../src/types/mock/text/base64.js';

const text = (bytes: Uint8Array | undefined): string | undefined =>
  bytes === undefined ? undefined : Buffer.from(bytes).toString('utf8');

describe('decodeBase64', () => {
  for (const [encoded, decoded] of [
    ['dGVzdA==', 'test'],
    ['dGVzdDE=', 'test1'],
    ['dGVzdDEy', 'test12'],
    ['dGVz dA==', 'test'],
    ['dGVzdA==\n', 'test'],
    ['dGVz\r\ndA==', 'test'],
    ['', ''],
    ['  ', '']
  ]) {
    it(`decodes '${JSON.stringify(encoded).slice(1, -1)}'`, () => {
      const bytes = decodeBase64(encoded);

      expect(text(bytes)).to.equal(decoded);
    });
  }

  for (const [title, encoded] of [
    ['a value missing one padding character', 'dGVzdA='],
    ['a value without its padding', 'dGVzdA'],
    ['a value with three padding characters', 'dGVzd==='],
    ['padding in the middle', 'dG=zdA=='],
    ['a base64url character', 'd-Vz'],
    ['a character outside the alphabet', 'dGV!dA=='],
    ['padding alone', '====']
  ]) {
    it(`refuses ${title}, which Buffer.from would decode to something`, () => {
      const bytes = decodeBase64(encoded);

      expect(bytes).to.be.undefined;
    });
  }
});

describe('decodeBase64Url', () => {
  for (const value of ['ledger', 'ledger:write audit:read', 'http://localhost/callback?a=b', 'é😀', '']) {
    it(`reads back '${value}' as encodeBase64Url wrote it`, () => {
      const encoded = encodeBase64Url(Buffer.from(value, 'utf8'));

      const bytes = decodeBase64Url(encoded);

      expect(text(bytes)).to.equal(value);
    });
  }

  it('writes no padding and no character a URL would escape', () => {
    const bytes = Buffer.from([0xfb, 0xff, 0xfe, 0x3e]);

    const encoded = encodeBase64Url(bytes);

    expect(encoded).to.equal('-__-Pg');
  });

  for (const [title, encoded] of [
    ['a character outside the alphabet', '!!'],
    ['a base64 character', 'a+/b'],
    ['padding', 'bGVkZ2VyOg=='],
    ['a space', 'bGVk Z2Vy'],
    ['a length no bytes encode to', 'a']
  ]) {
    it(`refuses ${title}`, () => {
      const bytes = decodeBase64Url(encoded);

      expect(bytes).to.be.undefined;
    });
  }
});
