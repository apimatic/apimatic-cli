import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { MAX_BODY_BYTES } from '../../../src/types/mock/routing/body-limit.js';
import { tempMocks } from '../../helpers/mock-http.js';
import { TestRequest } from '../../helpers/mock-requests.js';
import { successStub } from '../../helpers/mock-stubs.js';

describe('what the host sends of a response where the transport has a say', () => {
  const temp = tempMocks();

  const document = (response: string, method = 'GET') =>
    temp.start({ 'a.json': successStub({ method, path: '/v1/document', response }) });

  for (const [method, status] of [
    ['HEAD', 200],
    ['GET', 304]
  ] as const) {
    it(`sends the Content-Length a stub states on a ${method} ${status} without a body as stated`, async () => {
      const mock = await document(`{ "status": ${status}, "headers": { "Content-Length": "1024" } }`, method);

      const response = await mock.send(TestRequest.of(method, '/v1/document'));

      expect([response.status, response.header('Content-Length')]).to.deep.equal([status, '1024']);
    });
  }

  for (const [kind, body] of [
    ['JSON', '{ "json": { "name": "café" } }'],
    ['text', '{ "text": "café" }'],
    ['bytes', '{ "bytes": "JVBERi0xLjQK" }'],
    ['multipart', '{ "multipart": { "parts": { "meta": { "json": { "a": 1 } }, "note": { "text": "x" } } } }']
  ]) {
    it(`sends a ${kind} body with its length in bytes, never chunked`, async () => {
      const mock = await document(`{ "status": 200, "body": ${body} }`);

      const response = await mock.send(TestRequest.get('/v1/document'));

      expect([response.header('Content-Length'), response.header('Transfer-Encoding')]).to.deep.equal([
        String(response.body.length),
        ''
      ]);
    });
  }

  it('sends the 418 report with its length, never chunked', async () => {
    const mock = await document('{ "status": 200 }');

    const response = await mock.send(TestRequest.get('/v1/nothing'));

    expect([response.status, response.header('Content-Length'), response.header('Transfer-Encoding')]).to.deep.equal([
      418,
      String(response.body.length),
      ''
    ]);
  });

  it('writes the 418 report with LF line ends on every platform', async () => {
    const mock = await document('{ "status": 200 }');

    const response = await mock.send(TestRequest.get('/v1/nothing'));

    expect([response.text().includes('\r'), response.text().startsWith('{\n  "type": ')]).to.deep.equal([false, true]);
  });

  it('sends a stream chunked, since its length is not known when it starts', async () => {
    const mock = await temp.start({
      'a.json': successStub({
        path: '/v1/events',
        response: '{ "status": 200, "body": { "sse": [ { "data": "one" } ] } }'
      })
    });

    const response = await mock.send(TestRequest.get('/v1/events'));

    expect([response.header('Content-Length'), response.header('Transfer-Encoding')]).to.deep.equal(['', 'chunked']);
  });

  it('states the length of the body a HEAD answer leaves out', async () => {
    const mock = await document('{ "status": 200, "body": { "json": { "a": 1 } } }', 'HEAD');

    const response = await mock.send(TestRequest.of('HEAD', '/v1/document'));

    expect([response.header('Content-Length'), response.body.length]).to.deep.equal(['7', 0]);
  });

  it('states a length of 0 for an answer without a body, never chunked', async () => {
    const mock = await document('{ "status": 200 }');

    const response = await mock.send(TestRequest.get('/v1/document'));

    expect([response.header('Content-Length'), response.header('Transfer-Encoding')]).to.deep.equal(['0', '']);
  });

  it('sends a text body as UTF-8 text/plain, byte for byte', async () => {
    const text = 'Sun, 06 Nov 1994 08:49:37 GMT, café';
    const mock = await document(`{ "status": 200, "body": { "text": "${text}" } }`);

    const response = await mock.send(TestRequest.get('/v1/document'));

    expect([response.header('Content-Type'), response.body.equals(Buffer.from(text, 'utf8'))]).to.deep.equal([
      'text/plain; charset=utf-8',
      true
    ]);
  });

  it('sends a header the stub states twice over in its own letter case', async () => {
    const mock = await document('{ "status": 200, "headers": { "X-Request-ID": "req_1", "ETag": "\\"v1\\"" } }');

    const answer = await mock.sendRaw('GET', '/v1/document');

    expect([answer.includes('\r\nX-Request-ID: req_1\r\n'), answer.includes('\r\nETag: "v1"\r\n')]).to.deep.equal([
      true,
      true
    ]);
  });
});

describe('the request body limit over HTTP', () => {
  const temp = tempMocks();

  const upload = () =>
    temp.start({
      'a.json': successStub({ method: 'POST', path: '/v1/upload', body: '"body": { "any": true }' })
    });

  it('answers 413 to a body that declares more than the limit, naming both numbers', async () => {
    const mock = await upload();

    const response = await mock.send(TestRequest.post('/v1/upload').bytes(Buffer.alloc(MAX_BODY_BYTES + 1)));

    expect([response.status, response.header('Content-Type'), response.text()]).to.deep.equal([
      413,
      'text/plain; charset=utf-8',
      'The mock accepts a request body of at most 30,000,000 bytes; this one declares 30,000,001.'
    ]);
  });

  it('matches a body at the limit', async () => {
    const mock = await upload();

    const response = await mock.send(TestRequest.post('/v1/upload').bytes(Buffer.alloc(MAX_BODY_BYTES)));

    expect(response.status).to.equal(200);
  });

  it('answers 413 to a body that declares no length where it passes the limit', async () => {
    const mock = await upload();

    const response = await mock.send(
      TestRequest.post('/v1/upload')
        .bytes(Buffer.alloc(MAX_BODY_BYTES + 1))
        .chunked()
    );

    expect([response.status, response.text()]).to.deep.equal([
      413,
      'The mock accepts a request body of at most 30,000,000 bytes; this one declares no length and is longer.'
    ]);
  });

  it('matches a body sent without its length that fits', async () => {
    const mock = await upload();

    const response = await mock.send(TestRequest.post('/v1/upload').bytes(Buffer.from('{"a":1}')).chunked());

    expect(response.status).to.equal(200);
  });
});
