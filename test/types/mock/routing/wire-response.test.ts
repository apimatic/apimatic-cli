import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { readJson } from '../../../../src/types/mock/json/json-reader.js';
import {
  wireMismatch,
  wireRefusal,
  WireResponse,
  wireResponseOf
} from '../../../../src/types/mock/routing/wire-response.js';
import { Header, ResponseBody, StubResponse } from '../../../../src/types/mock/stub-format/stub-response.js';
import { TestRequest } from '../../../helpers/mock-requests.js';

const json = (text: string): ResponseBody => ({ kind: 'json', json: readJson(text)._unsafeUnwrap() });
const EMPTY: ResponseBody = { kind: 'empty' };
const STREAM: ResponseBody = { kind: 'sse', events: [{ data: 'one' }, { data: 'two' }], chunkDelayMs: 5 };

const responseOf = (body: ResponseBody, status = 200, headers: Header[] = []): StubResponse => ({
  status,
  headers,
  body
});
const linesOf = (wire: WireResponse): string[] => wire.headers.map(({ name, value }) => `${name}: ${value}`);
const bytesOf = (wire: WireResponse): string =>
  wire.body.kind === 'whole' ? Buffer.from(wire.body.bytes).toString('utf8') : '<paced>';

describe('wireResponseOf', () => {
  const bodies: [string, ResponseBody, string, number][] = [
    ['a JSON body', json('{ "name": "café" }'), 'application/json', 16],
    ['a text body', { kind: 'text', text: 'café' }, 'text/plain; charset=utf-8', 5],
    ['a bytes body', { kind: 'bytes', bytes: Buffer.from('%PDF-1.4\n') }, 'application/octet-stream', 9]
  ];

  for (const [what, body, contentType, length] of bodies) {
    it(`states the type and the UTF-8 byte length of ${what}`, () => {
      const wire = wireResponseOf(responseOf(body), 'GET');

      expect(linesOf(wire)).to.deep.equal([`Content-Type: ${contentType}`, `Content-Length: ${length}`]);
    });
  }

  it('renders a multipart body under its boundary and states its length', () => {
    const body: ResponseBody = {
      kind: 'multipart',
      boundary: 'b',
      parts: [{ name: 'note', contentType: 'text/plain; charset=utf-8', content: { kind: 'text', text: 'x' } }]
    };

    const wire = wireResponseOf(responseOf(body), 'GET');

    expect([linesOf(wire), bytesOf(wire).startsWith('--b\r\n')]).to.deep.equal([
      ['Content-Type: multipart/form-data; boundary=b', `Content-Length: ${bytesOf(wire).length}`],
      true
    ]);
  });

  it('serves a JSON body as written, digits beyond 2^53 included', () => {
    const wire = wireResponseOf(responseOf(json('{ "sequence": 9007199254740993, "amount": 250.00 }')), 'GET');

    expect(bytesOf(wire)).to.equal('{"sequence":9007199254740993,"amount":250.00}');
  });

  const lengths: [string, number, string, string[]][] = [
    ['states a length of 0 for a response without a body', 200, 'GET', ['Content-Length: 0']],
    ['states a length of 0 for a 205', 205, 'POST', ['Content-Length: 0']],
    ['states no length for a 204', 204, 'DELETE', []],
    ['states no length for a 304', 304, 'GET', []],
    ['states no length for a HEAD answer without a body', 200, 'HEAD', []]
  ];

  for (const [title, status, method, lines] of lengths) {
    it(title, () => {
      const wire = wireResponseOf(responseOf(EMPTY, status), method);

      expect(linesOf(wire)).to.deep.equal(lines);
    });
  }

  for (const [method, status] of [
    ['HEAD', 200],
    ['GET', 304]
  ] as const) {
    it(`sends the Content-Length a stub states on a ${method} ${status} as written, once`, () => {
      const stated = responseOf(EMPTY, status, [{ name: 'content-length', value: '1024' }]);

      const wire = wireResponseOf(stated, method);

      expect(linesOf(wire)).to.deep.equal(['content-length: 1024']);
    });
  }

  it('states the length of the body a HEAD answer leaves out', () => {
    const wire = wireResponseOf(responseOf(json('{ "a": 1 }')), 'HEAD');

    expect([linesOf(wire), bytesOf(wire)]).to.deep.equal([['Content-Type: application/json', 'Content-Length: 7'], '']);
  });

  it('paces a stream chunk by chunk and states no length for it', () => {
    const wire = wireResponseOf(responseOf(STREAM), 'GET');

    expect(wire).to.deep.equal({
      status: 200,
      headers: [
        { name: 'Cache-Control', value: 'no-cache' },
        { name: 'Content-Type', value: 'text/event-stream' }
      ],
      body: { kind: 'paced', chunks: ['data: one\n\n', 'data: two\n\n'], delayMs: 5 }
    });
  });

  it('sends the headers of a stream alone to a HEAD', () => {
    const wire = wireResponseOf(responseOf(STREAM), 'HEAD');

    expect([linesOf(wire), bytesOf(wire)]).to.deep.equal([
      ['Cache-Control: no-cache', 'Content-Type: text/event-stream'],
      ''
    ]);
  });

  it('keeps the status and the headers the stub states, a stated Content-Type winning', () => {
    const stated = responseOf({ kind: 'bytes', bytes: Buffer.from('x') }, 201, [
      { name: 'Content-Type', value: 'application/pdf' },
      { name: 'X-Request-Id', value: 'req_1' }
    ]);

    const wire = wireResponseOf(stated, 'GET');

    expect([wire.status, linesOf(wire)]).to.deep.equal([
      201,
      ['Content-Type: application/pdf', 'X-Request-Id: req_1', 'Content-Length: 1']
    ]);
  });
});

describe('wireMismatch', () => {
  const noStubs = { kind: 'noStubs' } as const;

  it('sends the report as indented problem+json with the summary in its header and its length stated', () => {
    const wire = wireMismatch(TestRequest.get('/v1/x').build(), noStubs);

    expect([wire.status, linesOf(wire), bytesOf(wire)]).to.deep.equal([
      418,
      [
        'Content-Type: application/problem+json',
        'X-Mock-Mismatch: no stubs loaded',
        `Content-Length: ${bytesOf(wire).length}`
      ],
      [
        '{',
        '  "type": "urn:mock-server:mismatch",',
        '  "status": 418,',
        '  "title": "No stub matches this request",',
        '  "detail": "No stubs are loaded.",',
        '  "request": "GET /v1/x",',
        '  "differences": []',
        '}'
      ].join('\n')
    ]);
  });

  it('states the length of the report a HEAD answer leaves out', () => {
    const wire = wireMismatch(TestRequest.of('HEAD', '/v1/x').build(), noStubs);

    expect([wire.headers.at(-1), bytesOf(wire)]).to.deep.equal([{ name: 'Content-Length', value: '184' }, '']);
  });
});

describe('wireRefusal', () => {
  it("sends the host's own reason as UTF-8 text with its length", () => {
    const wire = wireRefusal(413, 'Too long: café');

    expect([wire.status, linesOf(wire), bytesOf(wire)]).to.deep.equal([
      413,
      ['Content-Type: text/plain; charset=utf-8', 'Content-Length: 15'],
      'Too long: café'
    ]);
  });
});
