import { expect } from 'chai';
import { parseMediaType } from '../../../../src/types/mock/text/media-type.js';

const read = (text: string) => {
  const mediaType = parseMediaType(text);
  return mediaType === undefined ? undefined : [mediaType.essence, Object.fromEntries(mediaType.parameters)];
};

describe('parseMediaType', () => {
  for (const [text, essence, parameters] of [
    ['application/json', 'application/json', {}],
    ['Application/JSON', 'application/json', {}],
    ['text/plain; charset=utf-8', 'text/plain', { charset: 'utf-8' }],
    ['text/plain;charset=UTF-8', 'text/plain', { charset: 'UTF-8' }],
    ['text/plain ; Charset="iso-8859-1"', 'text/plain', { charset: 'iso-8859-1' }],
    ['multipart/form-data; boundary=mockserver-boundary', 'multipart/form-data', { boundary: 'mockserver-boundary' }],
    ['MULTIPART/MIXED; BOUNDARY=b1', 'multipart/mixed', { boundary: 'b1' }],
    ['multipart/form-data; boundary="a;b=c"', 'multipart/form-data', { boundary: 'a;b=c' }],
    ['multipart/form-data; boundary="a\\"b"', 'multipart/form-data', { boundary: 'a"b' }],
    ['text/plain; charset=utf-8; format=flowed', 'text/plain', { charset: 'utf-8', format: 'flowed' }],
    ['text/plain; charset=utf-8; charset=latin1', 'text/plain', { charset: 'utf-8' }],
    ['text/plain; charset=utf-8;', 'text/plain', { charset: 'utf-8' }],
    ['application/vnd.api+json', 'application/vnd.api+json', {}]
  ] as const) {
    it(`reads '${text}'`, () => {
      const mediaType = read(text);

      expect(mediaType).to.deep.equal([essence, parameters]);
    });
  }

  for (const text of [
    '',
    'multipart',
    'text/',
    '/plain',
    'text/plain/extra',
    'text plain',
    'text/plain; charset',
    'text/plain; =utf-8',
    'text/plain; charset=',
    'text/plain; charset=a b',
    'text/plain; charset="utf-8',
    'tëxt/plain'
  ]) {
    it(`reads no media type in '${text}'`, () => {
      const mediaType = read(text);

      expect(mediaType).to.be.undefined;
    });
  }
});
