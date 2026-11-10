import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { MAX_BODY_BYTES } from '../../../src/types/mock/routing/body-limit.js';
import { tempMocks, TestMock } from '../../helpers/mock-http.js';
import { TestRequest } from '../../helpers/mock-requests.js';
import { errorStub, successStub } from '../../helpers/mock-stubs.js';

const LOG = '/__admin/requests';

describe('the admin API over HTTP', () => {
  const temp = tempMocks();

  const oneStub = () => temp.start({ 'a.json': successStub() });
  const logOf = async (mock: TestMock) => (await mock.send(TestRequest.get(LOG))).expectJson(200);

  it('lists every request that reached the router, oldest first, with what came of it', async () => {
    const mock = await temp.start({ 'a.json': successStub({ method: 'POST', body: '"body": { "any": true }' }) });
    await mock.send(TestRequest.post('/v1/x').header('X-Run', 'r1').json('{"a":1}'));
    await mock.send(TestRequest.get('/v1/y').query('q', 'cash flow'));

    const response = await mock.send(TestRequest.get(LOG));

    const [first, second] = response.expectJson(200);
    expect([response.header('Content-Type'), first, second.request, second.response.status]).to.deep.equal([
      'application/json',
      {
        request: {
          method: 'POST',
          path: '/v1/x',
          query: {},
          headers: {
            connection: ['close'],
            'content-length': ['7'],
            'content-type': ['application/json'],
            host: [new URL(mock.url).host],
            'x-run': ['r1']
          },
          body: '{"a":1}'
        },
        response: { status: 200, stub: 's' }
      },
      {
        method: 'GET',
        path: '/v1/y',
        query: { q: ['cash flow'] },
        headers: { connection: ['close'], host: [new URL(mock.url).host] }
      },
      418
    ]);
  });

  it('tells a miss from a 418 a stub declares: only the miss has a mismatch', async () => {
    const mock = await temp.start({ 'teapot.json': errorStub({ name: 'teapot', status: 418, path: '/v1/teapot' }) });
    await mock.send(TestRequest.get('/v1/teapot').prefer('code=418'));
    await mock.send(TestRequest.get('/nowhere'));

    const log = await logOf(mock);

    expect(
      log.map((entry: any) => [entry.request.path, entry.response.stub, 'mismatch' in entry.response])
    ).to.deep.equal([
      ['/v1/teapot', 'teapot', false],
      ['/nowhere', undefined, true]
    ]);
  });

  it('clears the log on a DELETE, answering 204', async () => {
    const mock = await oneStub();
    await mock.send(TestRequest.get('/v1/x'));

    const response = await mock.send(TestRequest.delete(LOG));

    expect([response.status, response.text(), await logOf(mock)]).to.deep.equal([204, '', []]);
  });

  it('logs neither its own requests nor one the host refused before the router', async () => {
    const mock = await oneStub();
    await mock.send(TestRequest.get(LOG));
    await mock.send(TestRequest.get('/__admin/mappings'));
    await mock.send(TestRequest.get('/v1/x').header('Host', 'localhost:99999'));
    await mock.send(TestRequest.post('/v1/x').bytes(Buffer.alloc(MAX_BODY_BYTES + 1)));

    const log = await logOf(mock);

    expect(log).to.deep.equal([]);
  });

  for (const method of ['POST', 'PUT', 'PATCH', 'HEAD']) {
    it(`refuses ${method} on the request log with 405 and what is allowed`, async () => {
      const mock = await oneStub();

      const response = await mock.send(TestRequest.of(method, LOG));

      expect([response.status, response.header('Allow')]).to.deep.equal([405, 'GET, DELETE']);
    });
  }

  for (const [method, path] of [
    ['GET', '/__admin/mappings'],
    ['GET', '/__admin/settings'],
    ['POST', '/__admin/mappings'],
    ['POST', '/__admin/mappings/reset'],
    ['POST', '/__admin/requests/find'],
    ['DELETE', '/__ADMIN/requests'],
    ['POST', '/__admin%2Fmappings']
  ]) {
    it(`answers 404 to ${method} ${path}: the request log is all the admin API has`, async () => {
      const mock = await oneStub();

      const response = await mock.send(TestRequest.of(method, path));

      expect([
        response.status,
        response.text().startsWith("The mock's admin API is the request log at ")
      ]).to.deep.equal([404, true]);
    });
  }

  for (const path of ['/__admin%2Frequests', '/%5F%5Fadmin/requests']) {
    it(`reads the path decoded once, so ${path} is the request log`, async () => {
      const mock = await oneStub();

      const response = await mock.send(TestRequest.get(path));

      expect(response.expectJson(200)).to.deep.equal([]);
    });
  }

  for (const path of ['/%255F%255Fadmin/requests', '/v1/../__admin/requests']) {
    it(`leaves ${path} to the router, which answers 418`, async () => {
      const mock = await oneStub();

      const response = await mock.send(TestRequest.get(path));

      expect(response.status).to.equal(418);
    });
  }

  it('keeps serving the stubs after a write it refused', async () => {
    const mock = await oneStub();
    await mock.send(TestRequest.post('/__admin/mappings/reset'));

    const response = await mock.send(TestRequest.get('/v1/x'));

    expect(response.status).to.equal(200);
  });
});
