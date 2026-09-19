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

/**
 * What the tests walk through the slimmed document. Deliberately loose: each case builds its
 * own fixture, so a return type inferred from one of them makes every path and component the
 * others declare a type error. These are fixtures being asserted on, not a contract.
 */
interface JsonTree {
  [key: string]: JsonTree;
}

const bundledOf = (props: Props) => props.payload.bundled as unknown as JsonTree;

describe('slimOpenAPIPageProps', () => {
  it('keeps only the path items the page renders', () => {
    const slim = bundledOf(slimOpenAPIPageProps(propsFor({ operations: [{ path: '/pets', method: 'get' }] })));

    expect(Object.keys(slim.paths)).to.deep.equal(['/pets']);
    expect(slim.paths['/pets']).to.deep.equal(document.paths['/pets']);
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

    expect((slim as { document?: string }).document).to.equal('pets');
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

  it('drops a components section left empty once nothing is reached', () => {
    const noneReached = {
      openapi: '3.1.0',
      info: document.info,
      paths: { '/x': { get: {} } },
      components: { schemas: { Unused: { type: 'string' } } }
    };
    const slim = bundledOf(
      slimOpenAPIPageProps({ document: 'x', payload: { bundled: noneReached as never }, operations: [{ path: '/x', method: 'get' }] } as Props)
    );

    expect(slim).to.not.have.property('components');
  });

  describe('narrowing a path item to the rendered operation', () => {
    // Fumadocs renders one operation per page and reads only pathItem[method], so a sibling
    // method would otherwise carry its whole schema closure onto every page of the path.
    const multi = {
      openapi: '3.1.0',
      info: document.info,
      paths: {
        '/pets/{id}': {
          summary: 'One pet',
          parameters: [{ $ref: '#/components/parameters/Id' }],
          get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/GetBody' } } } } } },
          delete: { responses: { '204': { content: { 'application/json': { schema: { $ref: '#/components/schemas/DeleteBody' } } } } } }
        }
      },
      components: {
        parameters: { Id: { name: 'id', in: 'path' } },
        schemas: { GetBody: { type: 'object' }, DeleteBody: { type: 'object' } }
      }
    };

    const slimFor = (method: string) =>
      bundledOf(
        slimOpenAPIPageProps({
          document: 'multi',
          payload: { bundled: multi as never },
          operations: [{ path: '/pets/{id}', method }]
        } as unknown as Props)
      );

    it('keeps the rendered method and drops its siblings', () => {
      const slim = slimFor('delete');

      expect(slim.paths['/pets/{id}']).to.have.property('delete');
      expect(slim.paths['/pets/{id}']).to.not.have.property('get');
    });

    it('keeps the path-level fields the renderer reads from the same item', () => {
      const item = slimFor('delete').paths['/pets/{id}'] as Record<string, unknown>;

      expect(item.summary).to.equal('One pet');
      expect(item.parameters).to.deep.equal(multi.paths['/pets/{id}'].parameters);
    });

    it('leaves only the schemas the rendered method reaches', () => {
      const schemas = slimFor('delete').components.schemas;

      expect(Object.keys(schemas)).to.deep.equal(['DeleteBody']);
    });

    it('passes a path item that is itself a reference through untouched', () => {
      const referenced = {
        openapi: '3.1.0',
        info: document.info,
        paths: { '/x': { $ref: '#/components/pathItems/Shared' } },
        components: { pathItems: { Shared: { get: {} } } }
      };
      const slim = bundledOf(
        slimOpenAPIPageProps({
          document: 'ref',
          payload: { bundled: referenced as never },
          operations: [{ path: '/x', method: 'get' }]
        } as unknown as Props)
      );

      expect(slim.paths['/x']).to.deep.equal({ $ref: '#/components/pathItems/Shared' });
      expect(slim.components.pathItems).to.have.property('Shared');
    });
  });

  it('keeps the whole component a reference addresses a node inside', () => {
    // `#/components/schemas/Pet/properties/id` is legal and passes through bundling
    // untouched; matching the tail as part of the name dropped Pet and left the
    // reference with nothing to resolve against.
    const deep = {
      openapi: '3.1.0',
      info: document.info,
      paths: { '/x': { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet/properties/id' } } } } } } } },
      components: { schemas: { Pet: { properties: { id: { type: 'string' } } }, Unused: { type: 'string' } } }
    };
    const slim = bundledOf(
      slimOpenAPIPageProps({ document: 'deep', payload: { bundled: deep as never }, operations: [{ path: '/x', method: 'get' }] } as Props)
    );

    expect(Object.keys(slim.components.schemas)).to.deep.equal(['Pet']);
  });

  describe('documents bundled from several files', () => {
    // The bundler embeds external documents under `x-ext` and rewrites file and URL
    // references to point inside it, so nothing there matches `#/components/`.
    const bundledExternal = {
      openapi: '3.1.0',
      info: document.info,
      paths: {
        '/alpha': { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/x-ext/hash1/components/schemas/Alpha' } } } } } } },
        '/beta': { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/x-ext/hash2/components/schemas/Beta' } } } } } } }
      },
      'x-ext': {
        hash1: {
          components: {
            schemas: {
              Alpha: { properties: { next: { $ref: '#/x-ext/hash1/components/schemas/AlphaTail' } } },
              AlphaTail: { type: 'string' },
              AlphaUnused: { type: 'string' }
            }
          }
        },
        hash2: { components: { schemas: { Beta: { type: 'object' } } } }
      }
    };

    const slimAlpha = () =>
      bundledOf(
        slimOpenAPIPageProps({
          document: 'ext',
          payload: { bundled: bundledExternal as never },
          operations: [{ path: '/alpha', method: 'get' }]
        } as unknown as Props)
      ) as unknown as { 'x-ext': JsonTree };

    it('keeps the embedded node a reference addresses, at the same pointer', () => {
      const external = slimAlpha()['x-ext'];

      expect(external.hash1.components.schemas.Alpha).to.deep.equal(bundledExternal['x-ext'].hash1.components.schemas.Alpha);
    });

    it('follows references between embedded documents', () => {
      const schemas = slimAlpha()['x-ext'].hash1.components.schemas;

      expect(Object.keys(schemas).sort()).to.deep.equal(['Alpha', 'AlphaTail']);
    });

    it('drops the embedded documents the page never reaches', () => {
      expect(slimAlpha()['x-ext']).to.not.have.property('hash2');
    });

    // The cycle guard for #/components has a test of its own; the one for x-ext had none,
    // and a document split across files reaches its schemas only through this path.
    it('terminates on a self-referential and mutually recursive embedded schema', () => {
      const cyclic = {
        openapi: '3.1.0',
        info: document.info,
        paths: {
          '/x': {
            get: {
              responses: { '200': { content: { 'application/json': { schema: { $ref: '#/x-ext/h/components/schemas/Node' } } } } }
            }
          }
        },
        'x-ext': {
          h: {
            components: {
              schemas: {
                Node: {
                  properties: {
                    self: { $ref: '#/x-ext/h/components/schemas/Node' },
                    a: { $ref: '#/x-ext/h/components/schemas/A' }
                  }
                },
                A: { properties: { b: { $ref: '#/x-ext/h/components/schemas/B' } } },
                B: { properties: { a: { $ref: '#/x-ext/h/components/schemas/A' } } }
              }
            }
          }
        }
      };

      const slim = bundledOf(
        slimOpenAPIPageProps({
          document: 'cyc',
          payload: { bundled: cyclic as never },
          operations: [{ path: '/x', method: 'get' }]
        } as unknown as Props)
      ) as unknown as { 'x-ext': JsonTree };

      expect(Object.keys(slim['x-ext'].h.components.schemas).sort()).to.deep.equal(['A', 'B', 'Node']);
    });

    // A scheme is kept because `security` names it, not because anything references it --
    // but in a split document the scheme itself holds references, and keeping it without
    // them left the auth section of every operation page resolving to nothing.
    it('follows references out of a security scheme it kept by name', () => {
      const withScheme = {
        openapi: '3.1.0',
        info: document.info,
        security: [{ oauth: [] }],
        paths: { '/x': { get: { responses: { '200': { description: 'ok' } } } } },
        components: {
          securitySchemes: {
            oauth: { type: 'oauth2', 'x-detail': { $ref: '#/x-ext/h/components/schemas/Scopes' } }
          }
        },
        'x-ext': { h: { components: { schemas: { Scopes: { type: 'object' }, Unused: { type: 'string' } } } } }
      };

      const slim = bundledOf(
        slimOpenAPIPageProps({
          document: 'sec',
          payload: { bundled: withScheme as never },
          operations: [{ path: '/x', method: 'get' }]
        } as unknown as Props)
      ) as unknown as { 'x-ext': JsonTree };

      expect(Object.keys(slim['x-ext'].h.components.schemas)).to.deep.equal(['Scopes']);
    });
  });

  it('terminates on self-referential and mutually recursive schemas', () => {
    const recursive = {
      openapi: '3.1.0',
      info: document.info,
      paths: { '/x': { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } } } } } } },
      components: {
        schemas: {
          Node: { properties: { self: { $ref: '#/components/schemas/Node' }, a: { $ref: '#/components/schemas/A' } } },
          A: { properties: { b: { $ref: '#/components/schemas/B' } } },
          B: { properties: { a: { $ref: '#/components/schemas/A' } } }
        }
      }
    };

    const slim = bundledOf(
      slimOpenAPIPageProps({ document: 'rec', payload: { bundled: recursive as never }, operations: [{ path: '/x', method: 'get' }] } as Props)
    );

    expect(Object.keys(slim.components.schemas).sort()).to.deep.equal(['A', 'B', 'Node']);
  });
});
