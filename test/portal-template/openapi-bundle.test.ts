import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';
import { stringify as toYaml } from 'yaml';
import { createOpenAPI } from 'fumadocs-openapi/server';
import { bundleSpecification } from '../../portal-template/src/lib/openapi-bundle.server';
import { openApiSection } from '../../portal-template/src/lib/openapi-section.server';

const info = { title: 'Pets', version: '1' };

const operation = (schema: unknown) => ({
  tags: ['pets'],
  responses: { '200': { description: 'ok', content: { 'application/json': { schema } } } }
});

const responseSchema = (document: any, route: string) =>
  document.paths[route].get.responses['200'].content['application/json'].schema;

// A specification split across files, as `redocly split` and hand-organised projects lay one
// out. Fumadocs bundles these itself, but misreads what its bundler produces.
describe('bundleSpecification', () => {
  let root: string;

  const write = (relative: string, value: unknown) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, relative.endsWith('.json') ? JSON.stringify(value) : toYaml(value));
    return target;
  };

  // The document as fumadocs holds it once it has loaded and upgraded it.
  const loaded = async (file: string): Promise<any> => {
    const server = createOpenAPI({ input: { api: () => bundleSpecification(file) } });
    return (await server.getSchemas()).api.bundled;
  };

  const rejection = (promise: Promise<unknown>): Promise<unknown> =>
    promise.then(
      () => undefined,
      (reason: unknown) => reason
    );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-bundle-'));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('gives every operation behind a path-item $ref a page', async () => {
    write('paths/pets.yaml', {
      get: { ...operation({ type: 'string' }), operationId: 'listPets', summary: 'List pets' },
      post: { ...operation({ type: 'string' }), operationId: 'createPet', summary: 'Create a pet' }
    });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: {
        '/pets': { $ref: './paths/pets.yaml' },
        '/owners': { $ref: '#/components/pathItems/Owners' }
      },
      components: {
        pathItems: {
          Owners: { get: { ...operation({ type: 'string' }), operationId: 'listOwners', summary: 'List owners' } }
        }
      }
    });

    const section = await openApiSection('api', file, { groupBy: 'tag', showDeprecated: true, showInternal: false });
    const titles = section.files
      .filter((entry) => entry.type === 'page')
      .map((entry) => (entry.data as { title?: string }).title);

    expect(titles).to.have.members(['List pets', 'Create a pet', 'List owners']);
  });

  it('keeps what a path item says beside its $ref over what the file says', async () => {
    write('paths/pets.yaml', { summary: 'From the file', get: operation({ type: 'string' }) });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: { '/pets': { $ref: './paths/pets.yaml', summary: 'Beside the reference' } }
    });

    const document: any = await bundleSpecification(file);

    expect(document.paths['/pets'].summary).to.equal('Beside the reference');
    expect(document.paths['/pets'].get).to.exist;
  });

  it('files a schema from another file under components/schemas, named after the file', async () => {
    write('schemas/Pet.yaml', { type: 'object', properties: { category: { $ref: './Category.yaml' } } });
    write('schemas/Category.yaml', { type: 'object', properties: { name: { type: 'string' } } });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: { '/pets': { get: operation({ $ref: './schemas/Pet.yaml' }) } }
    });

    const document: any = await bundleSpecification(file);

    expect(responseSchema(document, '/pets')).to.deep.equal({ $ref: '#/components/schemas/Pet' });
    expect(document.components.schemas.Pet.properties.category).to.deep.equal({
      $ref: '#/components/schemas/Category'
    });
    expect(document.components.schemas.Category).to.deep.equal({
      type: 'object',
      properties: { name: { type: 'string' } }
    });
    expect(document).to.not.have.property('x-ext');
  });

  it('files a schema behind a default response', async () => {
    write('Error.yaml', { type: 'object', example: { code: 1 } });
    const file = write('openapi.yaml', {
      openapi: '3.0.3',
      info,
      paths: {
        '/pets': {
          get: {
            tags: ['pets'],
            responses: {
              default: { description: 'error', content: { 'application/json': { schema: { $ref: './Error.yaml' } } } }
            }
          }
        }
      }
    });

    const document = await loaded(file);

    expect(document.paths['/pets'].get.responses.default.content['application/json'].schema).to.deep.equal({
      $ref: '#/components/schemas/Error'
    });
    expect(document.components.schemas.Error).to.deep.equal({ type: 'object', examples: [{ code: 1 }] });
  });

  it('files a schema kept under definitions in another file', async () => {
    write('models.yaml', { definitions: { Pet: { type: 'object', example: { id: 1 } } } });
    const file = write('openapi.yaml', {
      openapi: '3.0.3',
      info,
      paths: { '/pets': { get: operation({ $ref: './models.yaml#/definitions/Pet' }) } }
    });

    const document = await loaded(file);

    expect(responseSchema(document, '/pets')).to.deep.equal({ $ref: '#/components/schemas/Pet' });
    expect(document.components.schemas.Pet).to.deep.equal({ type: 'object', examples: [{ id: 1 }] });
  });

  it('files the schemas a chain of schema files only passes on', async () => {
    write('Pet.yaml', { $ref: './Animal.yaml' });
    write('Animal.yaml', { $ref: './Being.yaml' });
    write('Being.yaml', { type: 'object' });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: { '/pets': { get: operation({ $ref: './Pet.yaml' }) } }
    });

    const document: any = await bundleSpecification(file);

    expect(document.components.schemas).to.deep.equal({
      Pet: { $ref: '#/components/schemas/Animal' },
      Animal: { $ref: '#/components/schemas/Being' },
      Being: { type: 'object' }
    });
  });

  it('stops following a chain of schema files that loops', async () => {
    write('Pet.yaml', { $ref: './Animal.yaml' });
    write('Animal.yaml', { $ref: './Being.yaml' });
    write('Being.yaml', { $ref: './Animal.yaml' });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: { '/pets': { get: operation({ $ref: './Pet.yaml' }) } }
    });

    const document: any = await bundleSpecification(file);

    expect(document.components.schemas).to.deep.equal({
      Pet: { $ref: '#/components/schemas/Animal' },
      Animal: { $ref: '#/components/schemas/Being' },
      Being: { $ref: '#/components/schemas/Animal' }
    });
  });

  it('names a schema after a file whose name is not ASCII', async () => {
    write('宠物.yaml', { type: 'object' });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: { '/pets': { get: operation({ $ref: './宠物.yaml' }) } }
    });

    const document: any = await bundleSpecification(file);

    expect(responseSchema(document, '/pets')).to.deep.equal({ $ref: '#/components/schemas/宠物' });
    expect(document.components.schemas['宠物']).to.deep.equal({ type: 'object' });
  });

  it('files the item schema of a streamed response', async () => {
    write('Event.yaml', { type: 'object' });
    const file = write('openapi.yaml', {
      openapi: '3.2.0',
      info,
      paths: {
        '/events': {
          get: {
            tags: ['pets'],
            responses: {
              '200': { description: 'ok', content: { 'application/jsonl': { itemSchema: { $ref: './Event.yaml' } } } }
            }
          }
        }
      }
    });

    const document: any = await bundleSpecification(file);

    expect(document.paths['/events'].get.responses['200'].content['application/jsonl'].itemSchema).to.deep.equal({
      $ref: '#/components/schemas/Event'
    });
  });

  it('names a schema taken from inside a file after its key', async () => {
    write('common.yaml', { components: { schemas: { Tag: { type: 'string' } } } });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: {
        '/tags': { get: operation({ type: 'array', items: { $ref: './common.yaml#/components/schemas/Tag' } }) }
      }
    });

    const document: any = await bundleSpecification(file);

    expect(responseSchema(document, '/tags').items).to.deep.equal({ $ref: '#/components/schemas/Tag' });
    expect(document.components.schemas.Tag).to.deep.equal({ type: 'string' });
  });

  it('reads a key in a components map of another file as a name, not a keyword', async () => {
    write('Thing.yaml', { type: 'string' });
    write('common.yaml', {
      components: { schemas: { default: { type: 'object', properties: { thing: { $ref: './Thing.yaml' } } } } }
    });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: { '/settings': { get: operation({ $ref: './common.yaml#/components/schemas/default' }) } }
    });

    const document: any = await bundleSpecification(file);

    expect(document.components.schemas.default.properties.thing).to.deep.equal({
      $ref: '#/components/schemas/Thing'
    });
  });

  it('puts the file in place of a component that only referenced it', async () => {
    write('order-schema.yaml', { type: 'object', properties: { id: { type: 'integer' } } });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: {
        '/orders': { get: operation({ $ref: './order-schema.yaml' }) },
        '/orders/latest': { get: operation({ $ref: '#/components/schemas/Order' }) }
      },
      components: { schemas: { Order: { $ref: './order-schema.yaml' } } }
    });

    const document: any = await bundleSpecification(file);

    expect(document.components.schemas).to.deep.equal({
      Order: { type: 'object', properties: { id: { type: 'integer' } } }
    });
    expect(responseSchema(document, '/orders')).to.deep.equal({ $ref: '#/components/schemas/Order' });
  });

  it('gives a schema a suffix when its name is taken', async () => {
    write('other/Thing.yaml', { type: 'string' });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: {
        '/inline': { get: operation({ $ref: '#/components/schemas/Thing' }) },
        '/external': { get: operation({ $ref: './other/Thing.yaml' }) }
      },
      components: { schemas: { Thing: { type: 'integer' } } }
    });

    const document: any = await bundleSpecification(file);

    expect(document.components.schemas).to.deep.equal({ Thing: { type: 'integer' }, 'Thing-2': { type: 'string' } });
    expect(responseSchema(document, '/external')).to.deep.equal({ $ref: '#/components/schemas/Thing-2' });
  });

  it('points a schema that refers to its own file at its new place', async () => {
    write('TreeNode.yaml', {
      type: 'object',
      properties: { children: { type: 'array', items: { $ref: './TreeNode.yaml' } } }
    });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: { '/tree': { get: operation({ $ref: './TreeNode.yaml' }) } }
    });

    const document: any = await bundleSpecification(file);

    expect(document.components.schemas.TreeNode.properties.children.items).to.deep.equal({
      $ref: '#/components/schemas/TreeNode'
    });
  });

  it('points a reference in example data into a filed schema at its new place', async () => {
    write('Pet.yaml', { type: 'object', example: { name: 'Rex' } });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: {
        '/pets': {
          get: {
            tags: ['pets'],
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: './Pet.yaml' },
                    examples: { rex: { value: { $ref: './Pet.yaml#/example' } } }
                  }
                }
              }
            }
          }
        }
      }
    });

    const document: any = await bundleSpecification(file);

    expect(document.paths['/pets'].get.responses['200'].content['application/json'].examples.rex.value).to.deep.equal({
      $ref: '#/components/schemas/Pet/example'
    });
  });

  it('leaves parameters, responses and examples where the bundler put them', async () => {
    write('parameters.yaml', { Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } } });
    write('responses/NotFound.yaml', { description: 'Not found' });
    write('examples/rex.yaml', { value: { name: 'Rex' } });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: {
        '/pets': {
          get: {
            parameters: [{ $ref: './parameters.yaml#/Limit' }],
            responses: {
              '200': {
                description: 'ok',
                content: { 'application/json': { examples: { rex: { $ref: './examples/rex.yaml' } } } }
              },
              '404': { $ref: './responses/NotFound.yaml' }
            }
          }
        }
      }
    });

    const document: any = await bundleSpecification(file);
    const { parameters, responses } = document.paths['/pets'].get;

    expect(document.components).to.be.undefined;
    expect(parameters[0].$ref).to.match(/^#\/x-ext\//);
    expect(responses['404'].$ref).to.match(/^#\/x-ext\//);
    expect(responses['200'].content['application/json'].examples.rex.$ref).to.match(/^#\/x-ext\//);
  });

  it('lets fumadocs upgrade the OpenAPI 3.0 keywords in referenced files', async () => {
    write('Name.yaml', { type: 'string', nullable: true, example: 'Rex' });
    write('Pet.yaml', {
      type: 'object',
      properties: {
        name: { $ref: './Name.yaml' },
        age: { type: 'integer', minimum: 0, exclusiveMinimum: true, example: 3 }
      }
    });
    const file = write('openapi.yaml', {
      openapi: '3.0.3',
      info,
      paths: { '/pets': { get: operation({ $ref: './Pet.yaml' }) } }
    });

    const document = await loaded(file);

    expect(document.components.schemas.Name).to.deep.equal({ type: ['string', 'null'], examples: ['Rex'] });
    expect(document.components.schemas.Pet.properties.age).to.deep.equal({
      type: 'integer',
      exclusiveMinimum: 0,
      examples: [3]
    });
  });

  // Every page carries the document's top-level fields, and the record names files on the
  // machine running the build.
  it('drops the record of which file each embedded one came from', async () => {
    write('Pet.yaml', { type: 'object' });
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: { '/pets': { get: operation({ $ref: './Pet.yaml' }) } }
    });

    const document: any = await bundleSpecification(file);

    expect(document).to.not.have.property('x-ext-urls');
  });

  it('names a reference it cannot resolve', async () => {
    // The bundler warns as well as reporting the failure.
    sinon.stub(globalThis.console, 'warn');
    const file = write('openapi.yaml', {
      openapi: '3.1.0',
      info,
      paths: { '/pets': { get: operation({ $ref: './Missing.yaml' }) } }
    });

    const error = await rejection(bundleSpecification(file));

    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.include('./Missing.yaml');
  });

  // With several specifications, the path is what says which one failed.
  it('names the specification it cannot read', async () => {
    const file = path.join(root, 'missing.yaml');

    const error = await rejection(bundleSpecification(file));

    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.include(file);
  });

  it('leaves a single-file specification as written', async () => {
    const specification = {
      openapi: '3.1.0',
      info,
      paths: { '/pets': { get: operation({ $ref: '#/components/schemas/Pet' }) } },
      components: { schemas: { Pet: { type: 'object' } } }
    };
    const file = write('openapi.json', specification);

    expect(await bundleSpecification(file)).to.deep.equal(specification);
  });
});
