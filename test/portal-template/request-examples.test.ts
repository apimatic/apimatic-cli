import { expect } from 'chai';
import { Parameter, requestExamples, type RequestExample } from '../../portal-template/src/lib/request-examples';

const example = (id: string): RequestExample => ({ id, name: id });

const parameter = (location: string, name: string, ...ids: string[]) => ({
  in: location,
  name,
  examples: Object.fromEntries(ids.map((id) => [id, { value: `${name}-${id}` }]))
});

const idsOf = (bodyExamples: RequestExample[], ...parameters: object[]) =>
  requestExamples(bodyExamples, Parameter.listIn({ parameters }, {})).map((item) => item.id);

describe('requestExamples', () => {
  it('keeps the request body examples, whatever ids the parameters name', () => {
    expect(idsOf([example('alpha'), example('beta')], parameter('query', 'region', 'gamma', 'beta'))).to.deep.equal([
      'alpha',
      'beta'
    ]);
    expect(idsOf([example('alpha')], parameter('query', 'region', 'gamma'))).to.deep.equal(['alpha']);
  });

  it('takes the ids from the parameters when the request body names none', () => {
    expect(idsOf([example('_default')], parameter('query', 'view', 'summary', 'full'))).to.deep.equal([
      'summary',
      'full'
    ]);
  });

  it('treats a lone request body example keyed Example as naming no id', () => {
    expect(idsOf([example('Example')], parameter('query', 'region', 'q1', 'q2'))).to.deep.equal(['q1', 'q2']);
  });

  it('treats a lone request body example keyed default, an upgraded singular example, as naming no id', () => {
    expect(idsOf([example('default')], parameter('query', 'region', 'q1', 'q2'))).to.deep.equal(['q1', 'q2']);
  });

  it('lets a later parameter name the ids when an earlier one has only an upgraded singular example', () => {
    expect(
      idsOf(
        [example('_default')],
        parameter('query', 'view', 'default'),
        parameter('header', 'X-Tax', 'withTax', 'noTax')
      )
    ).to.deep.equal(['withTax', 'noTax']);
  });

  it('lets query parameters name the ids before headers and path parameters', () => {
    expect(
      idsOf(
        [example('_default')],
        parameter('path', 'itemId', 'byId'),
        parameter('header', 'X-Tax', 'withTax', 'noTax'),
        parameter('query', 'view', 'minimal', 'full')
      )
    ).to.deep.equal(['minimal', 'full']);
  });

  it('names a parameter example by its summary, as fumadocs names a request body example', () => {
    const [first] = requestExamples(
      [example('_default')],
      Parameter.listIn(
        {
          parameters: [
            {
              in: 'query',
              name: 'view',
              examples: { full: { summary: 'Everything', description: 'All fields', value: 1 } }
            }
          ]
        },
        {}
      )
    );

    expect([first.id, first.name, first.description]).to.deep.equal(['full', 'Everything', 'All fields']);
  });

  it('ignores a parameter example keyed Example when choosing the ids', () => {
    expect(idsOf([example('_default')], parameter('query', 'view', 'Example'))).to.deep.equal(['_default']);
  });

  it('reads parameters declared on the path item', () => {
    const examples = requestExamples(
      [example('_default')],
      Parameter.listIn({}, { parameters: [parameter('path', 'itemId', 'a', 'b')] })
    );

    expect(examples.map((item) => item.id)).to.deep.equal(['a', 'b']);
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
