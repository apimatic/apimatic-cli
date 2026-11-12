import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { readJson } from '../../../../src/types/mock/json/json-reader.js';
import {
  chunksOf,
  contentBytes,
  effectiveHeaders,
  renderSseEvent,
  ResponseBody,
  SseEvent,
  StubResponse,
  withOrigin
} from '../../../../src/types/mock/stub-format/stub-response.js';

const json = (text: string) => readJson(text)._unsafeUnwrap();

const bodies: Record<string, ResponseBody> = {
  json: { kind: 'json', json: { kind: 'null' } },
  text: { kind: 'text', text: '' },
  bytes: { kind: 'bytes', bytes: new Uint8Array() },
  multipart: { kind: 'multipart', boundary: 'mockserver-boundary', parts: [] }
};

describe('withOrigin', () => {
  it('replaces the placeholder in header values and leaves a body that holds it as written', () => {
    const response: StubResponse = {
      status: 201,
      headers: [
        { name: 'Link', value: '<{{origin}}/v1/audit-events?page_token=pt_2>; rel="next"' },
        { name: 'Location', value: '{{origin}}/v1/accounts/1' },
        { name: 'X-Request-Id', value: 'req_1' }
      ],
      body: { kind: 'text', text: '{{origin}} stays' }
    };

    const resolved = withOrigin(response, 'http://localhost:5000');

    expect(resolved).to.deep.equal({
      status: 201,
      headers: [
        { name: 'Link', value: '<http://localhost:5000/v1/audit-events?page_token=pt_2>; rel="next"' },
        { name: 'Location', value: 'http://localhost:5000/v1/accounts/1' },
        { name: 'X-Request-Id', value: 'req_1' }
      ],
      body: { kind: 'text', text: '{{origin}} stays' }
    });
  });

  it('hands a JSON body on as the same document, since a link paginator reads only its query string', () => {
    const body: ResponseBody = { kind: 'json', json: json('{"links":{"next":"{{origin}}/v1/items?page=2"}}') };

    const resolved = withOrigin({ status: 200, headers: [], body }, 'http://localhost:5000');

    expect(resolved.body).to.equal(body);
  });
});

describe('effectiveHeaders', () => {
  for (const [kind, contentType] of [
    ['json', 'application/json'],
    ['text', 'text/plain; charset=utf-8'],
    ['bytes', 'application/octet-stream'],
    ['multipart', 'multipart/form-data; boundary=mockserver-boundary']
  ]) {
    it(`gives a ${kind} body without a Content-Type the one its kind implies`, () => {
      const response: StubResponse = { status: 200, headers: [], body: bodies[kind] };

      const effective = effectiveHeaders(response);

      expect(effective).to.deep.equal([{ name: 'Content-Type', value: contentType }]);
    });
  }

  it('lets a stated Content-Type win over the implied one, in any letter case', () => {
    const response: StubResponse = {
      status: 200,
      headers: [{ name: 'content-type', value: 'application/pdf' }],
      body: { kind: 'bytes', bytes: Buffer.from('%PDF') }
    };

    const effective = effectiveHeaders(response);

    expect(effective).to.deep.equal([{ name: 'content-type', value: 'application/pdf' }]);
  });

  it('implies nothing for a response without a body', () => {
    const response: StubResponse = { status: 204, headers: [], body: { kind: 'empty' } };

    const effective = effectiveHeaders(response);

    expect(effective).to.deep.equal([]);
  });

  it('gives a stream its Content-Type and no-cache, listed by name with the stated headers', () => {
    const response: StubResponse = {
      status: 200,
      headers: [{ name: 'X-Request-Id', value: 'req_1' }],
      body: { kind: 'ndjson', lines: [], chunkDelayMs: 20 }
    };

    const effective = effectiveHeaders(response);

    expect(effective).to.deep.equal([
      { name: 'Cache-Control', value: 'no-cache' },
      { name: 'Content-Type', value: 'application/x-ndjson' },
      { name: 'X-Request-Id', value: 'req_1' }
    ]);
  });
});

describe('contentBytes', () => {
  it('writes a JSON body compactly with its numbers as the stub wrote them', () => {
    const content = { kind: 'json', json: json('{ "id": 9007199254740993, "amount": 250.00 }') } as const;

    const bytes = contentBytes(content);

    expect(Buffer.from(bytes).toString('utf8')).to.equal('{"id":9007199254740993,"amount":250.00}');
  });

  it('writes a text body as UTF-8', () => {
    const content = { kind: 'text', text: 'héllo' } as const;

    const bytes = contentBytes(content);

    expect(Buffer.from(bytes)).to.deep.equal(Buffer.from([0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f]));
  });
});

describe('chunksOf', () => {
  it('gives one chunk per ndjson line', () => {
    const body = { kind: 'ndjson', lines: ['1', '[2]'], chunkDelayMs: 20 } as const;

    const chunks = chunksOf(body);

    expect(chunks).to.deep.equal(['1\n', '[2]\n']);
  });

  it('gives one chunk per SSE event', () => {
    const first: SseEvent = { id: '1', data: 'one' };
    const second: SseEvent = { event: 'done', data: 'two' };

    const chunks = chunksOf({ kind: 'sse', events: [first, second], chunkDelayMs: 20 });

    expect(chunks).to.deep.equal(['id: 1\ndata: one\n\n', 'event: done\ndata: two\n\n']);
  });
});

describe('renderSseEvent', () => {
  for (const [title, event, rendered] of [
    [
      'every field on its own line, then a blank line',
      { id: '1', event: 'transaction.posted', retry: 1500, data: '{"a":1}' },
      'id: 1\nevent: transaction.posted\nretry: 1500\ndata: {"a":1}\n\n'
    ],
    ['data alone as one data line', { data: '[DONE]' }, 'data: [DONE]\n\n'],
    ['data of several lines as one data line each', { data: 'a\nb' }, 'data: a\ndata: b\n\n'],
    ['a lone CR in data as a line break, as SSE reads it', { data: 'a\rb' }, 'data: a\ndata: b\n\n'],
    ['CRLF in data as one line break', { data: 'a\r\nb' }, 'data: a\ndata: b\n\n'],
    ['empty data as an empty data line', { data: '' }, 'data: \n\n']
  ] as const) {
    it(`writes ${title}`, () => {
      const written = renderSseEvent(event);

      expect(written).to.equal(rendered);
    });
  }
});
