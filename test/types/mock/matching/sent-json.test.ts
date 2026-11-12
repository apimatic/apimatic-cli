import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { writeJson } from '../../../../src/types/mock/json/json-writer.js';
import { readSentJson } from '../../../../src/types/mock/matching/sent-json.js';

const utf8 = (text: string): Uint8Array => Buffer.from(text, 'utf8');

describe('readSentJson', () => {
  it('reads a JSON object as the document', () => {
    const bytes = utf8('{"a":[1,"x"]}');

    const json = readSentJson(bytes);

    expect(writeJson(json._unsafeUnwrap())).to.equal('{"a":[1,"x"]}');
  });

  it('reads the literal null as a document, not as a body that is missing', () => {
    const bytes = utf8('null');

    const json = readSentJson(bytes);

    expect(json._unsafeUnwrap()).to.deep.equal({ kind: 'null' });
  });

  it('says so when the bytes are not UTF-8, as José sent in Latin-1 is not', () => {
    const bytes = Buffer.from('{"m":"José"}', 'latin1');

    const json = readSentJson(bytes);

    expect(json._unsafeUnwrapErr()).to.equal('bytes that are not UTF-8');
  });

  it('refuses a lone surrogate deep in a document, before any stub looks at it', () => {
    const bytes = utf8('{"a":{"b":["ok","\\udc00"]}}');

    const json = readSentJson(bytes);

    expect(json._unsafeUnwrapErr()).to.include('surrogate');
  });

  it('refuses a key sent twice, naming it', () => {
    const bytes = utf8('{"a":1,"a":2}');

    const json = readSentJson(bytes);

    expect(json._unsafeUnwrapErr()).to.include("'a'");
  });

  it('refuses a body that starts with a byte-order mark, as a strict server does', () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8('{}')]);

    const json = readSentJson(bytes);

    expect(json._unsafeUnwrapErr()).to.include('U+FEFF');
  });
});
