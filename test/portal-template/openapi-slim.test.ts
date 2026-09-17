import { expect } from 'chai';
import { slimOpenAPIPageProps } from '../../portal-template/src/lib/openapi-slim';

type Props = Parameters<typeof slimOpenAPIPageProps>[0];

// A document shaped like the ones fumadocs-openapi bundles: schemas reference each other
// through `$ref`, a discriminator maps to schemas by string, and one schema is orphaned.
const document = {
  openapi: '3.1.0',
  info: { title: 'Pets', version: '1' },
  servers: [{ url: 'https://api.example.com' }],
  security: [{ apiKey: [] }],
  tags: [{ name: 'pets' }],
  paths: {
    '/pets': {
      parameters: [{ $ref: '#/components/parameters/Page' }],
      get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } }
    },
    '/owners': {
      get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Owner' } } } } } }
    }
  },
  webhooks: {
    petAdopted: { post: { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } },
    ownerMoved: { post: { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Owner' } } } } } }
  },
  components: {
    securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'X-Key' } },
    parameters: { Page: { name: 'page', in: 'query', schema: { type: 'integer' } } },
    schemas: {
      Pet: {
        oneOf: [{ $ref: '#/components/schemas/Cat' }],
        discriminator: { propertyName: 'kind', mapping: { dog: '#/components/schemas/Dog' } }
      },
      Cat: { properties: { collar: { $ref: '#/components/schemas/Collar' } } },
      Dog: { type: 'object' },
      Collar: { type: 'string' },
      Owner: { type: 'object' }
    }
  }
};

function propsFor(overrides: Partial<Props>): Props {
  return { document: 'pets', payload: { bundled: document as never }, ...overrides } as Props;
}

const bundledOf = (props: Props) => props.payload.bundled as unknown as typeof document;

describe('slimOpenAPIPageProps', () => {
  it('keeps only the path items the page renders', () => {
    const slim = bundledOf(slimOpenAPIPageProps(propsFor({ operations: [{ path: '/pets', method: 'get' }] })));

    expect(Object.keys(slim.paths)).to.deep.equal(['/pets']);
    expect(slim.paths['/pets']).to.equal(document.paths['/pets']);
  });

  it('keeps the components those items reach, following references through references', () => {
    const slim = bundledOf(slimOpenAPIPageProps(propsFor({ operations: [{ path: '/pets', method: 'get' }] })));

    expect(Object.keys(slim.components.schemas).sort()).to.deep.equal(['Cat', 'Collar', 'Dog', 'Pet']);
    expect(slim.components.parameters).to.have.property('Page');
  });

  it('keeps the security schemes even though nothing references them by name', () => {
    const slim = bundledOf(slimOpenAPIPageProps(propsFor({ operations: [{ path: '/owners', method: 'get' }] })));

    expect(slim.components.securitySchemes).to.deep.equal(document.components.securitySchemes);
    expect(slim.components.schemas).to.deep.equal({ Owner: document.components.schemas.Owner });
  });

  it('keeps only the webhooks the page renders', () => {
    const slim = bundledOf(slimOpenAPIPageProps(propsFor({ webhooks: [{ name: 'petAdopted', method: 'post' }] })));

    expect(Object.keys(slim.webhooks)).to.deep.equal(['petAdopted']);
    expect(slim.paths).to.deep.equal({});
    expect(Object.keys(slim.components.schemas).sort()).to.deep.equal(['Cat', 'Collar', 'Dog', 'Pet']);
  });

  it('keeps the document-level fields the client reads', () => {
    const slim = bundledOf(slimOpenAPIPageProps(propsFor({ operations: [] })));

    expect(slim.openapi).to.equal(document.openapi);
    expect(slim.info).to.equal(document.info);
    expect(slim.servers).to.equal(document.servers);
    expect(slim.security).to.equal(document.security);
    expect(slim.tags).to.equal(document.tags);
  });

  it('leaves the other props and the proxy URL alone', () => {
    const props = propsFor({ operations: [{ path: '/pets', method: 'get' }], hasHead: true } as Partial<Props>);
    (props.payload as { proxyUrl?: string }).proxyUrl = '/proxy';

    const slim = slimOpenAPIPageProps(props);

    expect(slim.document).to.equal('pets');
    expect((slim as { hasHead?: boolean }).hasHead).to.be.true;
    expect(slim.payload.proxyUrl).to.equal('/proxy');
  });

  it('resolves references whose component name is escaped as a JSON pointer', () => {
    const escaped = {
      openapi: '3.1.0',
      info: document.info,
      paths: { '/x': { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/a~1b%20c' } } } } } } } },
      components: { schemas: { 'a/b c': { type: 'string' }, other: { type: 'string' } } }
    };
    const slim = bundledOf(
      slimOpenAPIPageProps({ document: 'escaped', payload: { bundled: escaped as never }, operations: [{ path: '/x', method: 'get' }] } as Props)
    );

    expect(Object.keys(slim.components.schemas)).to.deep.equal(['a/b c']);
  });

  it('does not invent sections a document never had', () => {
    const bare = { openapi: '3.1.0', info: document.info, paths: { '/x': { get: {} } } };
    const slim = bundledOf(
      slimOpenAPIPageProps({ document: 'bare', payload: { bundled: bare as never }, operations: [{ path: '/x', method: 'get' }] } as Props)
    );

    expect(slim).to.not.have.property('webhooks');
    expect(slim).to.not.have.property('components');
  });
});
