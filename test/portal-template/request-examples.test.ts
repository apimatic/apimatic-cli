import { expect } from 'chai';
import { Parameter, requestExamples, type RequestExample } from '../../portal-template/src/lib/request-examples';

const data = (query: Record<string, unknown> = {}): RequestExample['data'] => ({
  method: 'get',
  path: {},
  query,
  header: {},
  cookie: {}
});

const example = (id: string, query: Record<string, unknown> = {}): RequestExample => ({
  id,
  name: id,
  data: data(query)
});

const parameter = (location: string, name: string, examples: Record<string, unknown>) => ({
  in: location,
  name,
  examples: Object.fromEntries(Object.entries(examples).map(([id, value]) => [id, { value }]))
});

const examplesOf = (bodyExamples: RequestExample[], ...parameters: object[]) =>
  requestExamples(bodyExamples, Parameter.listIn({ parameters }, {}));

describe('requestExamples', () => {
  it('keeps the request body examples and gives each parameter its value for that id', () => {
    const examples = examplesOf(
      [example('alpha', { region: 'gamma' }), example('beta', { region: 'gamma' })],
      parameter('query', 'region', { gamma: 'gamma', beta: 'beta' })
    );

    expect(examples.map((item) => [item.id, item.data.query.region])).to.deep.equal([
      ['alpha', 'gamma'],
      ['beta', 'beta']
    ]);
  });

  it('never adds an id only a parameter names beside request body examples', () => {
    const examples = examplesOf([example('alpha')], parameter('query', 'region', { gamma: 'gamma' }));

    expect(examples.map((item) => item.id)).to.deep.equal(['alpha']);
  });

  it('reads parameters declared on the path item', () => {
    const examples = requestExamples(
      [example('a'), example('b')],
      Parameter.listIn({}, { parameters: [parameter('path', 'itemId', { a: 'item-a', b: 'item-b' })] })
    );

    expect(examples.map((item) => [item.id, item.data.path.itemId])).to.deep.equal([
      ['a', 'item-a'],
      ['b', 'item-b']
    ]);
  });

  it('skips malformed parameters and examples without a value', () => {
    const parameters = Parameter.listIn(
      {
        parameters: [
          null,
          { in: 'body', name: 'x', examples: { a: { value: 1 } } },
          { in: 'query', examples: { a: { value: 1 } } },
          { in: 'query', name: 'view', examples: { a: { externalValue: 'https://example.com/a' } } }
        ]
      },
      undefined
    );

    expect(requestExamples([example('a', { view: 'kept' })], parameters).map((item) => item.data.query)).to.deep.equal([
      { view: 'kept' }
    ]);
  });
});
