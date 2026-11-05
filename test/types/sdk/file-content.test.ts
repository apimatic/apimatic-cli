import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { isBinary, keepsLineEndings, lineEndingFor } from '../../../src/types/sdk/file-content.js';

const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));
const text = (content: Uint8Array) => Buffer.from(content).toString('latin1');

describe('file content rules', () => {
  it('takes a NUL in the first 8000 bytes as binary, as git does', () => {
    expect(isBinary(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]))).to.be.true;
    expect(isBinary(bytes('plain text\n'))).to.be.false;
    expect(isBinary(new Uint8Array([...bytes('x'.repeat(8000)), 0x00]))).to.be.false;
  });

  it('leaves the line endings of a binary file, or one that already carries a CR, alone', () => {
    expect(keepsLineEndings(bytes('one\r\ntwo\n'))).to.be.true;
    expect(keepsLineEndings(new Uint8Array([0x00, 0x0a]))).to.be.true;
    expect(keepsLineEndings(bytes('one\ntwo\n'))).to.be.false;
  });

  it('writes a file the way its sample ends its lines, and as it is without one', () => {
    expect(text(lineEndingFor(bytes('one\ntwo\n'), bytes('a\r\nb\r\n')))).to.equal('one\r\ntwo\r\n');
    expect(text(lineEndingFor(bytes('one\ntwo\n'), bytes('a\nb\n')))).to.equal('one\ntwo\n');
    expect(text(lineEndingFor(bytes('one\ntwo\n'), undefined))).to.equal('one\ntwo\n');
    expect(text(lineEndingFor(bytes('one\r\ntwo\n'), bytes('a\r\n')))).to.equal('one\r\ntwo\n');
  });
});
