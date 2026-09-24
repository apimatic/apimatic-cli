import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import type { Document } from 'fumadocs-openapi';
import { withoutInternalOperations } from '../../portal-template/src/lib/openapi-filter';
import { openApiSection } from '../../portal-template/src/lib/openapi-section.server';

const ok = { 200: { description: 'ok' } };

describe('withoutInternalOperations', () => {
  const documentWith = (paths: Record<string, unknown>, extra: Record<string, unknown> = {}): Document =>
    ({ openapi: '3.1.0', info: { title: 'Pets', version: '1' }, paths, ...extra } as unknown as Document);

  const pathsOf = (document: Document) =>
    (document as unknown as { paths: Record<string, Record<string, unknown>> }).paths;

  it('removes an internal operation, and keeps the rest of the path item, deprecated operations included', () => {
    const document = documentWith({
      '/pets': {
        parameters: [{ name: 'limit', in: 'query' }],
        get: { operationId: 'list', responses: ok },
        post: { operationId: 'create', deprecated: true, responses: ok },
        put: { operationId: 'replace', 'x-internal': true, responses: ok }
      }
    });

    expect(pathsOf(withoutInternalOperations(document))['/pets']).to.deep.equal({
      parameters: [{ name: 'limit', in: 'query' }],
      get: { operationId: 'list', responses: ok },
      post: { operationId: 'create', deprecated: true, responses: ok }
    });
  });

  it('removes a path item left with no operation', () => {
    const document = documentWith({
      '/pets': { get: { operationId: 'list', responses: ok } },
      '/admin': { parameters: [], get: { operationId: 'admin', 'x-internal': true, responses: ok } }
    });

    expect(Object.keys(pathsOf(withoutInternalOperations(document)))).to.deep.equal(['/pets']);
  });

  // Only an actual `true` hides: `x-internal: "true"` is a vendor value like any other.
  it('hides only on true', () => {
    const document = documentWith({
      '/pets': { get: { operationId: 'list', 'x-internal': 'true', responses: ok } }
    });

    expect(withoutInternalOperations(document)).to.equal(document);
  });

  it('removes the webhooks it hides as it does the paths', () => {
    const document = documentWith(
      { '/pets': { get: { operationId: 'list', responses: ok } } },
      {
        webhooks: {
          adopted: { post: { operationId: 'adopted', 'x-internal': true, responses: ok } },
          born: { post: { operationId: 'born', responses: ok } }
        }
      }
    );

    const shown = withoutInternalOperations(document) as unknown as { webhooks: Record<string, unknown> };
    expect(Object.keys(shown.webhooks)).to.deep.equal(['born']);
  });

  it('removes a whole path marked internal', () => {
    const document = documentWith({
      '/pets': { get: { operationId: 'list', responses: ok } },
      '/admin': { 'x-internal': true, get: { operationId: 'admin', responses: ok } }
    });

    expect(Object.keys(pathsOf(withoutInternalOperations(document)))).to.deep.equal(['/pets']);
  });

  it('filters the operations OpenAPI 3.2 adds: query, and those under additionalOperations', () => {
    const document = documentWith({
      '/pets': {
        query: { operationId: 'search', 'x-internal': true, responses: ok },
        additionalOperations: {
          COPY: { operationId: 'copy', 'x-internal': true, responses: ok },
          LINK: { operationId: 'link', responses: ok }
        }
      }
    });

    expect(pathsOf(withoutInternalOperations(document))['/pets']).to.deep.equal({
      additionalOperations: { LINK: { operationId: 'link', responses: ok } }
    });
  });

  it('drops an emptied additionalOperations, and a path item it leaves with no operation', () => {
    const document = documentWith({
      '/pets': {
        get: { operationId: 'list', responses: ok },
        additionalOperations: { COPY: { operationId: 'copy', 'x-internal': true, responses: ok } }
      },
      '/admin': { additionalOperations: { PURGE: { operationId: 'purge', 'x-internal': true, responses: ok } } }
    });

    expect(pathsOf(withoutInternalOperations(document))).to.deep.equal({
      '/pets': { get: { operationId: 'list', responses: ok } }
    });
  });

  // Another path may share the component, so it is never edited; the path gets its own copy.
  it('follows a path item that is a reference, and inlines it only when something in it is hidden', () => {
    const shared = {
      get: { operationId: 'list', responses: ok },
      delete: { operationId: 'purge', 'x-internal': true, responses: ok }
    };
    const document = documentWith(
      {
        '/pets': { $ref: '#/components/pathItems/Pets', summary: 'Pets' },
        '/cats': { $ref: '#/components/pathItems/Cats' }
      },
      { components: { pathItems: { Pets: shared, Cats: { get: { operationId: 'cats', responses: ok } } } } }
    );

    const paths = pathsOf(withoutInternalOperations(document));

    expect(paths['/pets']).to.deep.equal({ summary: 'Pets', get: { operationId: 'list', responses: ok } });
    expect(paths['/cats']).to.deep.equal({ $ref: '#/components/pathItems/Cats' });
    expect(shared).to.have.property('delete');
  });

  // How a split specification reaches its path items once bundled: a component that is itself a
  // reference into an embedded file. Fumadocs follows the whole chain for a webhook.
  it('follows a chain of references to what it hides', () => {
    const document = documentWith(
      { '/pets': { get: { operationId: 'list', responses: ok } } },
      {
        webhooks: {
          adopted: { $ref: '#/components/pathItems/Adopted' },
          born: { $ref: '#/components/pathItems/Born' }
        },
        components: { pathItems: { Adopted: { $ref: '#/x-ext/abc1234' }, Born: { $ref: '#/x-ext/def5678' } } },
        'x-ext': {
          abc1234: { post: { operationId: 'adopted', 'x-internal': true, responses: ok } },
          def5678: {
            post: { operationId: 'born', responses: ok },
            put: { operationId: 'reborn', 'x-internal': true, responses: ok }
          }
        }
      }
    );

    const shown = withoutInternalOperations(document) as unknown as { webhooks: Record<string, unknown> };

    expect(shown.webhooks).to.deep.equal({ born: { post: { operationId: 'born', responses: ok } } });
  });

  // Fields beside a reference win over what it points to, so a path shared by two routes can
  // be marked internal on one of them.
  it('reads what is written beside a reference as part of the path item', () => {
    const document = documentWith(
      {
        '/pets': { $ref: '#/components/pathItems/Pets' },
        '/admin/pets': { $ref: '#/components/pathItems/Pets', 'x-internal': true }
      },
      {
        webhooks: { born: { $ref: '#/components/pathItems/Born', 'x-internal': true } },
        components: {
          pathItems: {
            Pets: { get: { operationId: 'list', responses: ok } },
            Born: { post: { operationId: 'born', responses: ok } }
          }
        }
      }
    );

    const shown = withoutInternalOperations(document) as unknown as Record<string, Record<string, unknown>>;

    expect(Object.keys(shown.paths)).to.deep.equal(['/pets']);
    expect(shown.webhooks).to.deep.equal({});
  });

  it('leaves a reference it cannot read where it is', () => {
    const document = documentWith({
      '/pets': { $ref: '#/components/pathItems/100%' },
      '/admin': { get: { operationId: 'admin', 'x-internal': true, responses: ok } }
    });

    expect(pathsOf(withoutInternalOperations(document))).to.deep.equal({
      '/pets': { $ref: '#/components/pathItems/100%' }
    });
  });

  // Every page's payload carries the document's tags, so a section of internal operations
  // would still be named and described to the reader.
  it('drops the tags only hidden operations carried, and the groups left holding none', () => {
    const document = documentWith(
      {
        '/pets': { get: { operationId: 'list', tags: ['pets'], responses: ok } },
        '/admin': { get: { operationId: 'admin', tags: ['admin', 'audit'], 'x-internal': true, responses: ok } }
      },
      {
        tags: [
          { name: 'pets' },
          { name: 'admin', description: 'Internal admin endpoints', parent: 'operations' },
          { name: 'audit', parent: 'operations' },
          { name: 'operations', kind: 'nav' },
          { name: 'unused' }
        ],
        'x-tagGroups': [
          { name: 'Public', tags: ['pets'] },
          { name: 'Staff', tags: ['admin', 'audit'] }
        ]
      }
    );

    const shown = withoutInternalOperations(document) as unknown as Record<string, unknown>;

    expect(shown.tags).to.deep.equal([{ name: 'pets' }, { name: 'unused' }]);
    expect(shown['x-tagGroups']).to.deep.equal([{ name: 'Public', tags: ['pets'] }]);
  });

  // No operation carries a group of its own, so it is only ever emptied through its children.
  it('drops a group once every tag under it has gone, and the group above that', () => {
    const document = documentWith(
      {
        '/pets': { get: { operationId: 'list', tags: ['pets'], responses: ok } },
        '/users': { get: { operationId: 'users', tags: ['Users'], 'x-internal': true, responses: ok } }
      },
      {
        tags: [
          { name: 'pets' },
          { name: 'Platform' },
          { name: 'Admin', description: 'Internal tools', parent: 'Platform' },
          { name: 'Users', parent: 'Admin' }
        ],
        'x-tagGroups': [
          { name: 'Public', tags: ['pets'] },
          { name: 'Staff', tags: ['Admin', 'Users'] }
        ]
      }
    );

    const shown = withoutInternalOperations(document) as unknown as Record<string, unknown>;

    expect(shown.tags).to.deep.equal([{ name: 'pets' }]);
    expect(shown['x-tagGroups']).to.deep.equal([{ name: 'Public', tags: ['pets'] }]);
  });

  it('drops a cycle of groups, and a group under itself, that nothing staying holds up', () => {
    const document = documentWith(
      {
        '/pets': { get: { operationId: 'list', tags: ['pets'], responses: ok } },
        '/admin': { get: { operationId: 'admin', tags: ['A', 'B', 'C'], 'x-internal': true, responses: ok } }
      },
      {
        tags: [
          { name: 'pets' },
          { name: 'A', description: 'Internal tools', parent: 'B' },
          { name: 'B', parent: 'A' },
          { name: 'C', parent: 'C' }
        ]
      }
    );

    const shown = withoutInternalOperations(document) as unknown as Record<string, unknown>;

    expect(shown.tags).to.deep.equal([{ name: 'pets' }]);
  });

  it('keeps a group while a tag under it stays, or a remaining operation carries it', () => {
    const document = documentWith(
      {
        '/billing': { get: { operationId: 'invoices', tags: ['Billing'], responses: ok } },
        '/refunds': { get: { operationId: 'refunds', tags: ['Refunds'], 'x-internal': true, responses: ok } },
        '/users': { get: { operationId: 'users', tags: ['Users'], 'x-internal': true, responses: ok } }
      },
      {
        tags: [
          { name: 'Billing' },
          { name: 'Refunds', parent: 'Billing' },
          { name: 'Admin' },
          { name: 'Users', parent: 'Admin' },
          { name: 'Guides', parent: 'Admin' }
        ]
      }
    );

    const shown = withoutInternalOperations(document) as unknown as Record<string, unknown>;

    expect(shown.tags).to.deep.equal([{ name: 'Billing' }, { name: 'Admin' }, { name: 'Guides', parent: 'Admin' }]);
  });

  it('keeps a tag a remaining operation still carries, and one a kept tag is grouped under', () => {
    const document = documentWith(
      {
        '/pets': { get: { operationId: 'list', tags: ['pets', 'shared'], responses: ok } },
        '/admin': { get: { operationId: 'admin', tags: ['shared', 'animals'], 'x-internal': true, responses: ok } }
      },
      { tags: [{ name: 'pets', parent: 'animals' }, { name: 'shared' }, { name: 'animals' }] }
    );

    const shown = withoutInternalOperations(document) as unknown as Record<string, unknown>;

    expect(shown.tags).to.deep.equal([{ name: 'pets', parent: 'animals' }, { name: 'shared' }, { name: 'animals' }]);
  });

  it('returns the document it was given when nothing is hidden', () => {
    const plain = documentWith({
      '/pets': {
        get: { operationId: 'list', responses: ok },
        post: { operationId: 'create', deprecated: true, responses: ok }
      }
    });

    expect(withoutInternalOperations(plain)).to.equal(plain);
  });

  it('leaves the document it was given untouched', () => {
    const document = documentWith({
      '/pets': {
        get: { operationId: 'list', responses: ok },
        post: { operationId: 'create', 'x-internal': true, responses: ok }
      }
    });
    const before = JSON.stringify(document);

    withoutInternalOperations(document);

    expect(JSON.stringify(document)).to.equal(before);
  });
});

/** The section built from a real file, through the same server and bundler the site uses. */
describe('openApiSection', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-section-'));
    // Referenced from the specification by relative path, so the pages are built from the
    // bundled document, with the file folded into it.
    fs.writeFileSync(
      path.join(directory, 'pet.json'),
      JSON.stringify({ Pet: { type: 'object', properties: { name: { type: 'string' } } } })
    );
    fs.writeFileSync(
      path.join(directory, 'api.json'),
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Pets', version: '1' },
        tags: [{ name: 'pets' }, { name: 'admin' }],
        paths: {
          '/pets': {
            get: { operationId: 'listPets', tags: ['pets'], responses: ok },
            post: { operationId: 'createPet', tags: ['pets'], deprecated: true, responses: ok }
          },
          '/pets/{id}': {
            get: {
              operationId: 'getPet',
              tags: ['pets'],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: {
                200: { description: 'ok', content: { 'application/json': { schema: { $ref: './pet.json#/Pet' } } } }
              }
            }
          },
          '/internal': { get: { operationId: 'internalOp', tags: ['admin'], 'x-internal': true, responses: ok } }
        },
        webhooks: {
          petAdopted: { post: { operationId: 'petAdopted', tags: ['pets'], 'x-internal': true, responses: ok } }
        }
      })
    );
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const section = () => openApiSection('pets', path.join(directory, 'api.json'));

  /** Each generated file's path, with forward slashes whatever the platform joined it with. */
  const filesOf = async () => (await section()).files.map((file) => file.path.split(path.sep).join('/'));

  // No page is the whole of it: the tag that held only internal operations gets no folder
  // either, since its metadata is generated from the same document.
  it('documents deprecated operations, grouped by tag, and leaves internal ones out, folder and all', async () => {
    const files = await filesOf();

    expect(files.filter((file) => file.endsWith('.mdx'))).to.have.members([
      'api/pets/pets/listPets.mdx',
      'api/pets/pets/createPet.mdx',
      'api/pets/pets/getPet.mdx'
    ]);
    expect(files.some((file) => file.includes('/admin'))).to.be.false;
  });

  // Every page carries the bundled document for the playground, so an internal operation left
  // in it would still reach the reader.
  it('keeps the internal operations out of each page’s payload too, and its external references intact', async () => {
    const page = (await section()).files.find((file) => file.path.endsWith('getPet.mdx'));
    const bundled = (
      page?.data as { getOpenAPIPageProps: () => { payload: { bundled: Record<string, any> } } }
    ).getOpenAPIPageProps().payload.bundled;

    expect(Object.keys(bundled.paths)).to.deep.equal(['/pets', '/pets/{id}']);
    expect(bundled.webhooks ?? {}).to.not.have.property('petAdopted');
    const reference = bundled.paths['/pets/{id}'].get.responses[200].content['application/json'].schema.$ref as string;
    expect(reference).to.match(/^#\//);
    const target = reference
      .slice(2)
      .split('/')
      .reduce((node: any, key) => node?.[key], bundled);
    expect(target).to.deep.equal({ type: 'object', properties: { name: { type: 'string' } } });
  });

  /** The message a section fails with for these paths, or undefined when it builds. */
  const failureFor = async (paths: Record<string, unknown>) => {
    fs.writeFileSync(
      path.join(directory, 'api.json'),
      JSON.stringify({ openapi: '3.1.0', info: { title: 'Pets', version: '1' }, paths })
    );
    try {
      await section();
      return undefined;
    } catch (error) {
      return (error as Error).message;
    }
  };

  const SHARED_PAGE =
    "[OpenAPI] 'pets' would put two pages at api/pets/pets/createPet.mdx, so one would be left out. " +
    'Give each operation an operationId of its own, and list each of its tags once.';

  it('refuses two operations that one operationId would give one page', async () => {
    expect(
      await failureFor({
        '/pets': { post: { operationId: 'createPet', tags: ['pets'], responses: ok } },
        '/cats': { post: { operationId: 'createPet', tags: ['pets'], responses: ok } }
      })
    ).to.equal(SHARED_PAGE);
  });

  // Fumadocs writes a page for each tag an operation lists, the same one twice included.
  it('refuses an operation that lists one tag twice', async () => {
    expect(
      await failureFor({ '/pets': { post: { operationId: 'createPet', tags: ['pets', 'pets'], responses: ok } } })
    ).to.equal(SHARED_PAGE);
  });
});
