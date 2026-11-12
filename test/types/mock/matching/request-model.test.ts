import { Buffer } from 'node:buffer';
import { expect } from 'chai';
import { RequestModel } from '../../../../src/types/mock/matching/request-model.js';
import { TestRequest } from '../../../helpers/mock-requests.js';

describe('RequestModel', () => {
  it('merges a name sent more than once into one list of values, names sorted', () => {
    const request = new RequestModel(
      'GET',
      '/v1/x',
      [
        ['tags', 'rent'],
        ['offset', '1'],
        ['tags', 'shared'],
        ['Offset', '2']
      ],
      [
        ['X-B', '1'],
        ['accept', 'a'],
        ['x-b', '2']
      ],
      new Uint8Array()
    );

    const merged = [request.query, request.headers];

    expect(merged).to.deep.equal([
      [
        { name: 'Offset', values: ['2'] },
        { name: 'offset', values: ['1'] },
        { name: 'tags', values: ['rent', 'shared'] }
      ],
      [
        { name: 'accept', values: ['a'] },
        { name: 'X-B', values: ['1', '2'] }
      ]
    ]);
  });

  it('finds a header under any letter case of its name, and a query key under its own alone', () => {
    const request = TestRequest.get('/v1/x').header('X-Request-Id', 'r1').query('Offset', '1').build();

    const found = [request.header('x-request-id'), request.queryValues('offset'), request.queryValues('Offset')];

    expect(found).to.deep.equal([['r1'], [], ['1']]);
  });

  it('reads every value of a cookie sent twice, under its exact name', () => {
    const request = TestRequest.get('/v1/x').cookie('a', '1').header('Cookie', 'a=2; b=3').build();

    const found = [request.cookie('a'), request.cookie('b'), request.cookie('A')];

    expect(found).to.deep.equal([['1', '2'], ['3'], []]);
  });

  it('reads a form body into decoded fields, a repeated one grouped', () => {
    const request = TestRequest.post('/v1/x')
      .text(
        'filter%5Bsince%5D=2026-02-01&tags=rent&tags=shared&note=month+end&q=a%2Bb',
        'application/x-www-form-urlencoded'
      )
      .build();

    const form = request.form();

    expect(form).to.deep.equal([
      { name: 'filter[since]', values: ['2026-02-01'] },
      { name: 'note', values: ['month end'] },
      { name: 'q', values: ['a+b'] },
      { name: 'tags', values: ['rent', 'shared'] }
    ]);
  });

  it('reads no form fields in a request without a body', () => {
    const request = TestRequest.get('/v1/x').build();

    const form = request.form();

    expect(form).to.deep.equal([]);
  });

  it('keeps a question mark at the start of a form body in the first name', () => {
    const request = TestRequest.post('/v1/x').text('?note=month+end&q=1', 'application/x-www-form-urlencoded').build();

    const form = request.form();

    expect(form.map((field) => field.name)).to.deep.equal(['?note', 'q']);
  });

  it('reads the body as a form once, however often it is asked', () => {
    const request = TestRequest.post('/v1/x').form(['a', '1']).build();

    const readings = [request.form(), request.form()];

    expect(readings[1]).to.equal(readings[0]);
  });

  it('reads the body as JSON once, however often it is asked', () => {
    const request = TestRequest.post('/v1/x').json('{"a":1}').build();

    const readings = [request.json(), request.json()];

    expect(readings[1]).to.equal(readings[0]);
  });

  it('tells a request with a body from one without', () => {
    const requests = [
      TestRequest.get('/v1/x').build(),
      TestRequest.post('/v1/x')
        .bytes(Buffer.from([0]))
        .build()
    ];

    const bodies = requests.map((request) => request.hasBody());

    expect(bodies).to.deep.equal([false, true]);
  });

  it('gives the first Content-Type sent, and nothing when none was', () => {
    const requests = [
      TestRequest.get('/v1/x').build(),
      TestRequest.post('/v1/x').json('{}').header('content-type', 'text/plain').build()
    ];

    const types = requests.map((request) => request.contentType());

    expect(types).to.deep.equal(['', 'application/json']);
  });

  for (const [title, request, line] of [
    ['the method and the path when there is no query', TestRequest.delete('/v1/accounts/1'), 'DELETE /v1/accounts/1'],
    [
      'the delimiters of a query escaped in a key or a value, keys sorted',
      TestRequest.get('/amp').query('q', 'a&b').query('e', '').query('x=y', '1#2').query('p', '50%'),
      'GET /amp?e=&p=50%25&q=a%26b&x%3Dy=1%232'
    ],
    ['the delimiters of a path escaped in the path', TestRequest.get('/zz/a?b=c#d'), 'GET /zz/a%3Fb=c%23d'],
    ['a percent sign in the path escaped', TestRequest.get('/zz/50%'), 'GET /zz/50%25'],
    [
      'a question mark in the path kept apart from the query',
      TestRequest.get('/zz/a?b').query('k', 'v'),
      'GET /zz/a%3Fb?k=v'
    ],
    [
      'brackets, spaces and accents as they were sent',
      TestRequest.get('/v1/x').query('filter[min_amount]', '10.00').query('q', 'café au lait'),
      'GET /v1/x?filter[min_amount]=10.00&q=café au lait'
    ],
    [
      'every value of a repeated key',
      TestRequest.get('/v1/x').query('tags', 'rent', 'shared'),
      'GET /v1/x?tags=rent&tags=shared'
    ]
  ] as const) {
    it(`quotes the request with ${title}`, () => {
      const written = request.build().line();

      expect(written).to.equal(line);
    });
  }
});
