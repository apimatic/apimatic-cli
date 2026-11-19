import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { writeJson } from '../../../../src/types/mock/json/json-writer.js';
import { adminAnswer, REQUEST_LOG_PATH } from '../../../../src/types/mock/routing/admin-api.js';
import {
  loggedRequest,
  REQUEST_LOG_CAPACITY,
  RequestLog,
  requestLogJson
} from '../../../../src/types/mock/routing/request-log.js';
import { respond } from '../../../../src/types/mock/routing/respond.js';
import { StubRouter } from '../../../../src/types/mock/routing/stub-router.js';
import { WireResponse } from '../../../../src/types/mock/routing/wire-response.js';
import { TestRequest } from '../../../helpers/mock-requests.js';
import { errorStub, oauth2Stub, stubsOf, successStub } from '../../../helpers/mock-stubs.js';

const ORIGIN = 'http://localhost:4010';
const stubs = stubsOf({
  'a.json': successStub({
    name: 'the stub',
    method: 'POST',
    body: '"body": { "any": true }',
    extraRequest: '"query": { "filter[since]": "2026-01-01", "tags": ["rent", "shared"] }'
  }),
  'b.json': errorStub({ name: 'teapot', status: 418, path: '/v1/teapot' }),
  'c.json': oauth2Stub()
});

const linesOf = (wire: WireResponse): string[] => wire.headers.map(({ name, value }) => `${name}: ${value}`);
const textOf = (wire: WireResponse): string =>
  wire.body.kind === 'whole' ? Buffer.from(wire.body.bytes).toString('utf8') : '<paced>';

/** A router and a log that has seen the given requests, as the host keeps them. */
function logged(...requests: TestRequest[]): { router: StubRouter; log: RequestLog } {
  const router = new StubRouter(stubs);
  const log = new RequestLog();
  requests.forEach((request) => respond(router, log, request.build(), ORIGIN));
  return { router, log };
}

const served = (log: RequestLog): string => writeJson(requestLogJson(log.requests()));

describe('RequestLog', () => {
  const entry = (path: string) => loggedRequest(TestRequest.get(path).build(), { kind: 'noStubs' });

  it('keeps requests in the order they came', () => {
    const log = new RequestLog();
    log.add(entry('/1'));

    log.add(entry('/2'));

    expect(log.requests().map((request) => request.path)).to.deep.equal(['/1', '/2']);
  });

  it('drops the oldest request once it holds as many as its capacity', () => {
    const log = new RequestLog(2);
    log.add(entry('/1'));
    log.add(entry('/2'));

    log.add(entry('/3'));

    expect(log.requests().map((request) => request.path)).to.deep.equal(['/2', '/3']);
  });

  it('holds nothing once it is cleared', () => {
    const log = new RequestLog();
    log.add(entry('/1'));

    log.clear();

    expect(log.requests()).to.deep.equal([]);
  });

  it('keeps 10,000 requests unless told otherwise', () => {
    expect(REQUEST_LOG_CAPACITY).to.equal(10_000);
  });
});

describe('requestLogJson', () => {
  it('writes a request as decoded for matching, header names in lower case, with the stub that answered', () => {
    const request = TestRequest.post('/v1/x')
      .query('filter[since]', '2026-01-01')
      .query('tags', 'rent', 'shared')
      .header('Prefer', 'test-run=abc')
      .json('{"a":1}');

    const { log } = logged(request);

    expect(served(log)).to.equal(
      '[{"request":{"method":"POST","path":"/v1/x",' +
        '"query":{"filter[since]":["2026-01-01"],"tags":["rent","shared"]},' +
        '"headers":{"content-type":["application/json"],"prefer":["test-run=abc"]},' +
        '"body":"{\\"a\\":1}"},' +
        '"response":{"status":200,"stub":"the stub"}}]'
    );
  });

  it('writes a body that is not UTF-8 as base64, so no byte is lost', () => {
    const { log } = logged(TestRequest.post('/v1/y').bytes(Buffer.from([0xff, 0xfe, 0x00])));

    expect(served(log)).to.include('"headers":{"content-type":["application/octet-stream"]},"bodyBase64":"//4A"}');
  });

  it('writes no body member for a request without one', () => {
    const { log } = logged(TestRequest.get('/v1/x'));

    expect(served(log)).to.include('"request":{"method":"GET","path":"/v1/x","query":{},"headers":{}}');
  });

  it('gives a miss the summary of its report, which a 418 a stub declares does not have', () => {
    const { log } = logged(TestRequest.get('/v1/teapot').prefer('code=418'), TestRequest.get('/nowhere'));

    const responses = served(log)
      .split('"response":')
      .slice(1)
      .map((response) => response.slice(0, 40));

    expect(responses).to.deep.equal([
      '{"status":418,"stub":"teapot"}},{"reques',
      `{"status":418,"mismatch":"closest 'the s`
    ]);
  });

  it('names no stub for an answer the OAuth2 server composed, and gives its refusal as a miss', () => {
    const token = (secret: string) =>
      TestRequest.post('/oauth2/token').form(
        ['grant_type', 'client_credentials'],
        ['client_id', 'c'],
        ['client_secret', secret]
      );

    const { log } = logged(token('s'), token('nope'));

    expect(log.requests().map(({ status, outcome }) => [status, outcome.kind])).to.deep.equal([
      [200, 'served'],
      [418, 'miss']
    ]);
  });
});

describe('the admin API', () => {
  it('leaves a path outside its prefix to the router', () => {
    const answer = adminAnswer(TestRequest.get('/v1/__admin/requests').build(), new RequestLog());

    expect(answer).to.equal(undefined);
  });

  it('serves the request log as JSON to a GET', () => {
    const { router, log } = logged(TestRequest.get('/v1/y'));

    const answer = respond(router, log, TestRequest.get(REQUEST_LOG_PATH).build(), ORIGIN);

    expect([answer.status, linesOf(answer)[0], textOf(answer)]).to.deep.equal([
      200,
      'Content-Type: application/json',
      served(log)
    ]);
  });

  it('clears the request log on a DELETE and answers 204', () => {
    const { router, log } = logged(TestRequest.get('/v1/y'));

    const answer = respond(router, log, TestRequest.delete(REQUEST_LOG_PATH).build(), ORIGIN);

    expect([answer.status, textOf(answer), log.requests()]).to.deep.equal([204, '', []]);
  });

  it('does not log a request to itself', () => {
    const { log } = logged(TestRequest.get(REQUEST_LOG_PATH), TestRequest.get('/__admin/mappings'));

    expect(log.requests()).to.deep.equal([]);
  });

  for (const method of ['POST', 'PUT', 'PATCH', 'HEAD', 'get']) {
    it(`refuses ${method} on the request log with 405, naming what is allowed`, () => {
      const { router, log } = logged(TestRequest.get('/v1/y'));

      const answer = respond(router, log, TestRequest.of(method, REQUEST_LOG_PATH).build(), ORIGIN);

      expect([answer.status, linesOf(answer), textOf(answer), log.requests().length]).to.deep.equal([
        405,
        ['Content-Type: text/plain; charset=utf-8', 'Allow: GET, DELETE', `Content-Length: ${textOf(answer).length}`],
        `The mock's request log is read with GET and cleared with DELETE; ${method} is refused.`,
        1
      ]);
    });
  }

  for (const [method, path] of [
    ['GET', '/__admin'],
    ['GET', '/__admin/'],
    ['GET', '/__admin/mappings'],
    ['POST', '/__admin/mappings/reset'],
    ['POST', '/__admin/requests/find'],
    ['DELETE', '/__ADMIN/requests'],
    ['GET', '/__admin/requests/']
  ]) {
    it(`answers 404 to ${method} ${path}, since the request log is all there is`, () => {
      const answer = adminAnswer(TestRequest.of(method, path).build(), new RequestLog());

      expect([answer?.status, answer === undefined ? '' : textOf(answer)]).to.deep.equal([
        404,
        `The mock's admin API is the request log at /__admin/requests alone; there is no ${path}.`
      ]);
    });
  }
});
