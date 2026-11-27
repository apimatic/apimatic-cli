import { expect } from 'chai';
import { tempMocks } from '../../helpers/mock-http.js';
import { TestRequest } from '../../helpers/mock-requests.js';
import { successStub } from '../../helpers/mock-stubs.js';

/** Two events 20 s apart: a stream that is not ended early outlasts every limit below. */
const SLOW_STREAM = successStub({
  response: '{ "status": 200, "chunkDelayMs": 20000, "body": { "sse": [ { "data": "one" }, { "data": "two" } ] } }'
});

describe('a streamed body over HTTP', () => {
  const temp = tempMocks();

  for (const [status, body, extraStub] of [
    [201, '{ "sse": [ { "data": "started" } ] }', ''],
    [202, '{ "ndjson": [ { "id": 1 } ] }', ''],
    [503, '{ "sse": [ { "data": "busy" } ] }', '"kind": "error"']
  ] as const) {
    it(`goes out under the stub's status, here ${status}`, async () => {
      const mock = await temp.start({
        's.json': successStub({ extraStub, response: `{ "status": ${status}, "body": ${body} }` })
      });

      const response = await mock.send(TestRequest.get('/v1/x').prefer(`code=${status}`));

      expect([response.status, response.header('Transfer-Encoding')]).to.deep.equal([status, 'chunked']);
    });
  }

  it("pauses the stub's chunkDelayMs between lines", async () => {
    const mock = await temp.start({
      's.json': successStub({
        response: '{ "status": 200, "chunkDelayMs": 400, "body": { "ndjson": [ { "n": 1 }, { "n": 2 }, { "n": 3 } ] } }'
      })
    });

    const response = await mock.send(TestRequest.get('/v1/x'));

    expect([response.text(), response.spreadMs >= 400]).to.deep.equal(['{"n":1}\n{"n":2}\n{"n":3}\n', true]);
  });

  it('pauses the default 20 ms when the stub names no delay, so events arrive one by one', async () => {
    const mock = await temp.start({
      's.json': successStub({
        response: '{ "status": 200, "body": { "sse": [ { "data": "1" }, { "data": "2" }, { "data": "3" } ] } }'
      })
    });

    const response = await mock.send(TestRequest.get('/v1/x'));

    expect([response.sseData(), response.spreadMs >= 25]).to.deep.equal([['1', '2', '3'], true]);
  });

  it('ends after the last event without a pause', async () => {
    const mock = await temp.start({
      's.json': successStub({
        response: '{ "status": 200, "chunkDelayMs": 20000, "body": { "sse": [ { "data": "only" } ] } }'
      })
    });
    const started = Date.now();

    const response = await mock.send(TestRequest.get('/v1/x'));

    expect([response.text(), Date.now() - started < 5000]).to.deep.equal(['data: only\n\n', true]);
  });

  it('sends the first event before the pause, while the stream is still open', async () => {
    const mock = await temp.start({ 's.json': SLOW_STREAM });

    const stream = await mock.stream(TestRequest.get('/v1/x'));

    expect(stream.first).to.equal('data: one\n\n');
    stream.leave();
  });

  it('does not make a stop wait for a stream that is still open, and ends that stream where it stands', async () => {
    const mock = await temp.start({ 's.json': SLOW_STREAM });
    const stream = await mock.stream(TestRequest.get('/v1/x'));
    const started = Date.now();

    await mock.host.stop();

    expect([Date.now() - started < 5000, await stream.rest]).to.deep.equal([true, '']);
  });

  it('does not make a stop wait for a stream whose client has left', async () => {
    const mock = await temp.start({ 's.json': SLOW_STREAM });
    const stream = await mock.stream(TestRequest.get('/v1/x'));
    stream.leave();
    await stream.rest;
    const started = Date.now();

    await mock.host.stop();

    expect(Date.now() - started).to.be.lessThan(5000);
  });

  it('streams complete to each of two clients at once', async () => {
    const mock = await temp.start({
      's.json': successStub({
        response: '{ "status": 200, "chunkDelayMs": 50, "body": { "sse": [ { "data": "1" }, { "data": "2" } ] } }'
      })
    });

    const responses = await Promise.all([mock.send(TestRequest.get('/v1/x')), mock.send(TestRequest.get('/v1/x'))]);

    expect(responses.map((response) => response.sseData())).to.deep.equal([
      ['1', '2'],
      ['1', '2']
    ]);
  });
});
