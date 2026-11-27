import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { headerValues, requestModelOf } from '../../../../src/types/mock/routing/wire-request.js';

const NO_BODY = new Uint8Array();

describe('requestModelOf', () => {
  it('decodes the path once and the query once, and quotes both with their % escaped again', () => {
    const request = requestModelOf('GET', '/v1/x%252541?q=%2541', [], NO_BODY);

    expect([request.path, request.queryValues('q'), request.line()]).to.deep.equal([
      '/v1/x%2541',
      ['%41'],
      'GET /v1/x%252541?q=%2541'
    ]);
  });

  it('keeps the method as sent, so a lower-case one is seen as written', () => {
    const request = requestModelOf('patch', '/v1/x', [], NO_BODY);

    expect(request.method).to.equal('patch');
  });

  it('reads + as a space in the query and as a plus in the path', () => {
    const request = requestModelOf('GET', '/v1/a+b%20c?q=cash+flow&r=cash%2Bflow', [], NO_BODY);

    expect([request.path, request.queryValues('q'), request.queryValues('r')]).to.deep.equal([
      '/v1/a+b c',
      ['cash flow'],
      ['cash+flow']
    ]);
  });

  it('reads brackets and repeated keys of the query as a form encoder writes them', () => {
    const request = requestModelOf('GET', '/v1/x?filter%5Bstatus%5D=active&tags=rent&tags=shared', [], NO_BODY);

    expect([request.queryValues('filter[status]'), request.queryValues('tags')]).to.deep.equal([
      ['active'],
      ['rent', 'shared']
    ]);
  });

  const targets: [string, string, string, string][] = [
    ['a target without a query', '/v1/x', '/v1/x', 'GET /v1/x'],
    ['a target that ends at its question mark', '/v1/x?', '/v1/x', 'GET /v1/x'],
    ['a second question mark as part of the query', '/v1/x?a=b?c', '/v1/x', 'GET /v1/x?a=b?c'],
    ['a whole URL as its path and query', 'http://example.com:81/v1/x?y=1', '/v1/x', 'GET /v1/x?y=1'],
    ['a whole URL without a path as the root', 'http://example.com', '/', 'GET /'],
    ['a whole URL with a query alone as the root', 'http://example.com?y=1', '/', 'GET /?y=1'],
    ['the asterisk of OPTIONS as it is', '*', '*', 'GET *']
  ];

  for (const [what, target, path, line] of targets) {
    it(`reads ${what}`, () => {
      const request = requestModelOf('GET', target, [], NO_BODY);

      expect([request.path, request.line()]).to.deep.equal([path, line]);
    });
  }

  it('keeps a header sent twice as two values', () => {
    const request = requestModelOf(
      'GET',
      '/v1/x',
      [
        ['Accept', 'application/json'],
        ['accept', 'text/plain']
      ],
      NO_BODY
    );

    expect(request.header('Accept')).to.deep.equal(['application/json', 'text/plain']);
  });

  it('keeps the bytes of the body as sent', () => {
    const body = Buffer.from([0x1f, 0x8b, 0x08, 0x00]);

    const request = requestModelOf('PUT', '/v1/x', [['Content-Encoding', 'gzip']], body);

    expect(Buffer.from(request.body)).to.deep.equal(body);
  });
});

describe('headerValues', () => {
  it('finds every line of a header, its name in any letter case', () => {
    const values = headerValues(
      [
        ['Host', 'a'],
        ['Accept', '*/*'],
        ['HOST', 'b']
      ],
      'host'
    );

    expect(values).to.deep.equal(['a', 'b']);
  });
});
