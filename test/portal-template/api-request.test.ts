import { expect } from 'chai';
import type { FetchErrorResult, FetchResponseResult } from 'fumadocs-openapi/playground';
import { apiRequest } from '../../portal-template/src/lib/api-request';

describe('apiRequest', () => {
  const endpoint = 'GET /{operation}';
  // The request's own address, which holds filled-in values: never reported.
  const url = 'https://api.acme.com/v1/calc/SUM?x=4&api_key=s3cret';
  const response = (status: number, duration: number): FetchResponseResult => ({
    type: 'response',
    url,
    status,
    headers: new globalThis.Headers({ 'x-key': 's3cret' }),
    body: new ArrayBuffer(0),
    duration,
    text: () => 's3cret'
  });
  const clientError: FetchErrorResult = { type: 'client_error', url, message: 'Failed to fetch' };

  it('reports a response by its status and its own duration, rounded', () => {
    expect(apiRequest(endpoint, response(200, 123.4), 1000, 9000)).to.deep.equal({
      endpoint,
      status: '200',
      duration_ms: 123
    });
  });

  it('times a request that never reached the API from when it was sent', () => {
    expect(apiRequest(endpoint, clientError, 1000, 1250)).to.deep.equal({
      endpoint,
      status: 'client_error',
      duration_ms: 250
    });
  });

  it('gives no duration to a request that failed before it was sent', () => {
    expect(apiRequest(endpoint, clientError, null, 1250)).to.deep.include({ status: 'client_error', duration_ms: 0 });
  });

  it('carries the endpoint, the status and the duration, and nothing of the request', () => {
    const reported = apiRequest(endpoint, response(401, 8), null, 0);

    expect(Object.keys(reported).sort()).to.deep.equal(['duration_ms', 'endpoint', 'status']);
    expect(JSON.stringify(reported)).to.not.contain('s3cret');
  });
});
