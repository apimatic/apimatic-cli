import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { MultipartForm, parseMultipartForm } from '../../../../src/types/mock/matching/multipart-form.js';
import { ledger, sampleRequests } from '../../../helpers/mock-requests.js';

const crlf = (...lines: string[]): string => lines.join('\r\n');
const oneField = (boundary: string): string =>
  crlf(`--${boundary}`, 'Content-Disposition: form-data; name="note"', '', 'hello', `--${boundary}--`, '');
const parse = (body: string, contentType = 'multipart/form-data; boundary=abc'): MultipartForm =>
  parseMultipartForm(contentType, Buffer.from(body, 'utf8'));
/** Each part as [name, filename, Content-Type, content as text], which is all a part is. */
const read = (form: MultipartForm) =>
  form.kind === 'parts'
    ? [...form.byName.values()]
        .flat()
        .map((part) => [part.name, part.fileName, part.contentType, Buffer.from(part.content).toString('utf8')])
    : form;

describe('parseMultipartForm', () => {
  it('reads a file, a JSON and a text part, each with what its headers say, listed by name', () => {
    const request = sampleRequests.uploadDocument().build();

    const form = parseMultipartForm(request.contentType(), request.body);

    expect(read(form)).to.deep.equal([
      ['description', [], ['text/plain; charset=utf-8'], 'Monthly statement for February 2026'],
      ['file', ['statement-2026-02.pdf'], ['application/pdf'], '%PDF-1.7\n'],
      ['metadata', [], ['application/json; charset=utf-8'], ledger.documentMetadata]
    ]);
  });

  it('keeps every part of a name sent more than once, in the order sent', () => {
    const request = sampleRequests.uploadStatements('b.pdf', 'a.pdf', 'c.pdf').build();

    const form = parseMultipartForm(request.contentType(), request.body);

    expect(
      form.kind === 'parts' ? [...form.byName].map(([name, parts]) => [name, parts.map((part) => part.fileName)]) : form
    ).to.deep.equal([
      ['files', [['b.pdf'], ['a.pdf'], ['c.pdf']]],
      ['note', [[]]]
    ]);
  });

  for (const [title, disposition, part] of [
    [
      'a name and a filename without quotes, as .NET writes them',
      'form-data; name=file; filename=a.pdf',
      ['file', ['a.pdf'], [], 'x']
    ],
    [
      'filename* over filename when both are sent',
      'form-data; name="file"; filename="resume.pdf"; filename*=UTF-8\'\'r%C3%A9sum%C3%A9.pdf',
      ['file', ['résumé.pdf'], [], 'x']
    ],
    ['the disposition type in another letter case', 'FORM-DATA; NAME="file"', ['file', [], [], 'x']],
    ['a name that holds a semicolon inside its quotes', 'form-data; name="a;b"', ['a;b', [], [], 'x']],
    [
      'a filename* in a charset it does not read as none, falling back on filename',
      "form-data; name=f; filename=a.txt; filename*=iso-8859-1''%E9.txt",
      ['f', ['a.txt'], [], 'x']
    ]
  ] as const) {
    it(`reads ${title}`, () => {
      const body = crlf('--abc', `Content-Disposition: ${disposition}`, '', 'x', '--abc--', '');

      const form = parse(body);

      expect(read(form)).to.deep.equal([part]);
    });
  }

  it('keeps the bytes of a part as they were sent, line ends and all', () => {
    const body = Buffer.concat([
      Buffer.from('--abc\r\nContent-Disposition: form-data; name="raw"\r\n\r\n'),
      Buffer.from([0x00, 0xff, 0x0d, 0x0a, 0x2d, 0x2d, 0x61]),
      Buffer.from('\r\n--abc--\r\n')
    ]);

    const form = parseMultipartForm('multipart/form-data; boundary=abc', body);

    expect(form.kind === 'parts' ? [...(form.byName.get('raw')?.[0].content ?? [])] : form).to.deep.equal([
      0x00, 0xff, 0x0d, 0x0a, 0x2d, 0x2d, 0x61
    ]);
  });

  it('reads an empty part, and skips a preamble before the first delimiter and what follows the last', () => {
    const body = crlf(
      'ignored preamble',
      '--abc',
      'Content-Disposition: form-data; name="empty"',
      '',
      '',
      '--abc--',
      'ignored epilogue'
    );

    const form = parse(body);

    expect(read(form)).to.deep.equal([['empty', [], [], '']]);
  });

  it('reads the boundary from quotes, and a multipart type in another letter case', () => {
    const form = parse(oneField('abc'), 'Multipart/Form-Data; boundary="abc"');

    expect(read(form)).to.deep.equal([['note', [], [], 'hello']]);
  });

  it('reads the parts under a boundary of 70 characters', () => {
    const boundary = 'b'.repeat(70);

    const form = parse(oneField(boundary), `multipart/form-data; boundary=${boundary}`);

    expect(read(form)).to.deep.equal([['note', [], [], 'hello']]);
  });

  for (const [title, contentType, reported] of [
    ['a Content-Type without a boundary', 'multipart/form-data', 'multipart/form-data'],
    ['a JSON Content-Type', 'application/json; boundary=abc', 'application/json; boundary=abc'],
    ['another multipart type', 'multipart/mixed; boundary=abc', 'multipart/mixed; boundary=abc'],
    ['a text Content-Type', 'text/plain; boundary=abc', 'text/plain; boundary=abc'],
    ['no Content-Type', '', 'absent'],
    [
      'a boundary of 71 characters',
      `multipart/form-data; boundary=${'b'.repeat(71)}`,
      `multipart/form-data; boundary=${'b'.repeat(71)}`
    ]
  ]) {
    it(`reads no form under ${title}`, () => {
      const form = parse(oneField('abc'), contentType);

      expect(form).to.deep.equal({
        kind: 'unreadable',
        expected: 'multipart/form-data with a boundary',
        actual: reported
      });
    });
  }

  it('reads no form under a boundary of 17,000 characters, rather than searching for it', () => {
    const boundary = 'b'.repeat(17000);

    const form = parse(oneField(boundary), `multipart/form-data; boundary=${boundary}`);

    expect(form.kind === 'unreadable' ? form.expected : form).to.equal('multipart/form-data with a boundary');
  });

  for (const [title, body, reported] of [
    ['does not follow its boundary', 'garbage', 'a body without its --abc delimiter'],
    [
      'ends before its closing delimiter',
      crlf('--abc', 'Content-Disposition: form-data; name="note"', '', 'hello'),
      'a body that ends before its closing --abc-- delimiter'
    ],
    [
      'has a part whose headers never end',
      crlf('--abc', 'Content-Disposition: form-data; name="note"', '--abc--', ''),
      'a part whose headers never end in a blank line'
    ],
    [
      'has a section with another disposition',
      crlf(
        '--abc',
        'Content-Disposition: form-data; name="note"',
        '',
        'hello',
        '--abc',
        'Content-Disposition: attachment; name=extra',
        'Content-Type: text/plain',
        '',
        'hidden',
        '--abc--',
        ''
      ),
      'a section that is not form-data (Content-Disposition: attachment; name=extra)'
    ],
    [
      'has a section without a disposition',
      crlf(
        '--abc',
        'Content-Disposition: form-data; name="note"',
        '',
        'hello',
        '--abc',
        'X-Note: no disposition',
        'Content-Type: text/plain',
        '',
        'hidden',
        '--abc--',
        ''
      ),
      'a section that is not form-data (Content-Disposition: absent)'
    ],
    [
      'has a section without headers',
      crlf('--abc', '', 'hidden', '--abc--', ''),
      'a section that is not form-data (Content-Disposition: absent)'
    ]
  ]) {
    it(`says a body that ${title} is not well formed`, () => {
      const form = parse(body);

      expect(form).to.deep.equal({ kind: 'unreadable', expected: 'a well-formed multipart body', actual: reported });
    });
  }
});
