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

  it('takes the ids from the parameters when the request body names none', () => {
    const examples = examplesOf(
      [example('_default', { view: 'summary' })],
      parameter('query', 'view', { summary: 'summary', full: 'full' })
    );

    expect(examples.map((item) => [item.id, item.data.query.view])).to.deep.equal([
      ['summary', 'summary'],
      ['full', 'full']
    ]);
  });

  it('treats a lone request body example keyed Example as naming no id', () => {
    const examples = examplesOf([example('Example')], parameter('query', 'region', { q1: 'q1', q2: 'q2' }));

    expect(examples.map((item) => item.id)).to.deep.equal(['q1', 'q2']);
  });

  it('treats a lone request body example keyed default, an upgraded singular example, as naming no id', () => {
    const examples = examplesOf([example('default')], parameter('query', 'region', { q1: 'q1', q2: 'q2' }));

    expect(examples.map((item) => item.id)).to.deep.equal(['q1', 'q2']);
  });

  it('lets a later parameter name the ids when an earlier one has only an upgraded singular example', () => {
    const examples = examplesOf(
      [example('_default')],
      parameter('query', 'view', { default: 'summary' }),
      parameter('header', 'X-Tax', { withTax: 'with', noTax: 'none' })
    );

    expect(examples.map((item) => [item.id, item.data.query.view])).to.deep.equal([
      ['withTax', undefined],
      ['noTax', undefined]
    ]);
  });

  it('lets query parameters name the ids before headers and path parameters', () => {
    const examples = examplesOf(
      [example('_default')],
      parameter('path', 'itemId', { byId: 'item' }),
      parameter('header', 'X-Tax', { withTax: 'with', noTax: 'none' }),
      parameter('query', 'view', { minimal: 'minimal', full: 'full' })
    );

    expect(examples.map((item) => item.id)).to.deep.equal(['minimal', 'full']);
  });

  it('keeps the value a parameter already has for an id it does not name', () => {
    const examples = examplesOf(
      [example('_default', { view: 'minimal', region: 'eu' })],
      parameter('query', 'view', { minimal: 'minimal', full: 'full' }),
      parameter('query', 'region', { eu: 'eu', full: 'us' })
    );

    expect(examples.map((item) => item.data.query.region)).to.deep.equal(['eu', 'us']);
  });

  it('names a parameter example by its summary, as fumadocs names a request body example', () => {
    const [first] = examplesOf([example('_default')], {
      in: 'query',
      name: 'view',
      examples: { full: { summary: 'Everything', description: 'All fields', value: 'full' } }
    });

    expect([first.id, first.name, first.description]).to.deep.equal(['full', 'Everything', 'All fields']);
  });

  it('ignores a parameter example keyed Example when choosing the ids', () => {
    const examples = examplesOf([example('_default')], parameter('query', 'view', { Example: 'x' }));

    expect(examples.map((item) => item.id)).to.deep.equal(['_default']);
  });

  it('reads parameters declared on the path item', () => {
    const examples = requestExamples(
      [example('_default')],
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
          { in: 'query', name: 'view', examples: { external: { externalValue: 'https://example.com/a' } } }
        ]
      },
      undefined
    );

    expect(requestExamples([example('_default')], parameters).map((item) => item.id)).to.deep.equal(['_default']);
  });
});
