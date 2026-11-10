import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { readJson } from '../../../../src/types/mock/json/json-reader.js';
import {
  dispositionOf,
  isValidBoundary,
  partsContainingTheDelimiter,
  renderMultipart
} from '../../../../src/types/mock/stub-format/multipart-response.js';
import { effectiveHeaders, ResponsePart } from '../../../../src/types/mock/stub-format/stub-response.js';

const metadata: ResponsePart = {
  name: 'metadata',
  contentType: 'application/json',
  content: { kind: 'json', json: readJson('{ "title": "February statement" }')._unsafeUnwrap() }
};
const statement: ResponsePart = {
  name: 'file',
  fileName: 'statement-2026-02.pdf',
  contentType: 'application/pdf',
  content: { kind: 'bytes', bytes: Buffer.from('%PDF-1.7') }
};

describe('renderMultipart', () => {
  it('writes RFC 7578 parts with CRLF line ends and a closing delimiter', () => {
    const body = { kind: 'multipart', boundary: 'b1', parts: [metadata, statement] } as const;

    const rendered = renderMultipart(body);

    expect(Buffer.from(rendered).toString('utf8')).to.equal(
      [
        '--b1',
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        '{"title":"February statement"}',
        '--b1',
        'Content-Disposition: form-data; name="file"; filename="statement-2026-02.pdf"',
        'Content-Type: application/pdf',
        '',
        '%PDF-1.7',
        '--b1--',
        ''
      ].join('\r\n')
    );
  });

  it('writes a body without parts as the closing delimiter alone', () => {
    const body = { kind: 'multipart', boundary: 'b1', parts: [] } as const;

    const rendered = renderMultipart(body);

    expect(Buffer.from(rendered).toString('utf8')).to.equal('--b1--\r\n');
  });

  it('names its boundary in the Content-Type it implies', () => {
    const body = { kind: 'multipart', boundary: 'b1', parts: [metadata] } as const;

    const headers = effectiveHeaders({ status: 200, headers: [], body });

    expect(headers).to.deep.equal([{ name: 'Content-Type', value: 'multipart/form-data; boundary=b1' }]);
  });
});

describe('isValidBoundary', () => {
  for (const [boundary, valid] of [
    ['mockserver-boundary', true],
    ["aZ09'+_-.", true],
    ['b'.repeat(70), true],
    ['b'.repeat(71), false],
    ['', false],
    ['has space', false],
    ['a(b', false],
    ['a)b', false],
    ['a,b', false],
    ['a/b', false],
    ['a:b', false],
    ['a=b', false],
    ['a?b', false],
    ['semi;colon', false],
    ['quo"te', false],
    ['ünïcode', false]
  ] as const) {
    it(`${valid ? 'takes' : 'refuses'} '${boundary}'`, () => {
      const result = isValidBoundary(boundary);

      expect(result).to.equal(valid);
    });
  }
});

describe('partsContainingTheDelimiter', () => {
  it('names a part whose text holds the delimiter, which a reader would end there', () => {
    const leaky: ResponsePart = {
      name: 'note',
      contentType: 'text/plain',
      content: { kind: 'text', text: 'ends --b1 early' }
    };

    const parts = partsContainingTheDelimiter({ kind: 'multipart', boundary: 'b1', parts: [metadata, leaky] });

    expect(parts).to.deep.equal([leaky]);
  });

  it('names none when no part holds the delimiter', () => {
    const body = { kind: 'multipart', boundary: 'b1', parts: [metadata, statement] } as const;

    const parts = partsContainingTheDelimiter(body);

    expect(parts).to.deep.equal([]);
  });
});

describe('dispositionOf', () => {
  for (const [title, part, value] of [
    ['a field with its name quoted', metadata, 'form-data; name="metadata"'],
    ['a name that holds a space inside its quotes', { ...metadata, name: 'a b' }, 'form-data; name="a b"'],
    [
      'a file with its name and its filename quoted',
      statement,
      'form-data; name="file"; filename="statement-2026-02.pdf"'
    ]
  ] as const) {
    it(`writes ${title}`, () => {
      const written = dispositionOf(part);

      expect(written).to.equal(value);
    });
  }
});
