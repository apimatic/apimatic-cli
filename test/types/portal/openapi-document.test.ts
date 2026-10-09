import { expect } from 'chai';
import path from 'path';
import { OpenApiDocument, SpecFormat } from '../../../src/types/portal/openapi-document';
import { DirectoryPath } from '../../../src/types/file/directoryPath';

const BYTE_ORDER_MARK = '﻿';

describe('OpenApiDocument', () => {
  const read = (contents: string): OpenApiDocument => {
    const document = OpenApiDocument.parse(contents);
    expect(document.isOk(), `unparsable: ${contents}`).to.be.true;
    return document._unsafeUnwrap();
  };

  const readJson = (document: unknown, prefix = '') => read(prefix + JSON.stringify(document));
  const withInfo = (info: Record<string, unknown>) => readJson({ openapi: '3.0.0', info, paths: {} });
  const refused = (contents: string) => OpenApiDocument.parse(contents)._unsafeUnwrapErr();

  describe('parse', () => {
    it('reads JSON, and YAML, by what the text holds', () => {
      expect(readJson({ openapi: '3.1.0' }).format()).to.deep.equal({ supported: true });
      expect(read('openapi: 3.1.0\n').format()).to.deep.equal({ supported: true });
    });

    // Matched loosely: the words are the parser's own, and change with its version.
    it('fails with what the parser said, on one line, saying where it stopped', () => {
      const yaml = refused('openapi: 3.0.0\ninfo:\n  title: [unclosed\n');
      const json = refused('{\n  "a": 1\n  "b": 2\n}');
      const quoting = refused('[1,\n2,\n,3]');

      expect(yaml).to.match(/at line 4, column 1$/);
      expect(json).to.contain('line 3 column 3');
      [yaml, json, quoting].forEach((reason) => expect(reason).to.not.contain('\n'));
    });

    // The portal's bundler reads these as nothing, so a reference to one would be empty.
    it('fails on text the bundler reads as nothing, saying why', () => {
      expect(refused(' \n')).to.equal('it is empty');
      expect(refused('# only a comment: here\n')).to.equal('it holds no value');
      expect(refused('{ type: object }')).to.contain('JSON');
      expect(refused('- active\n- inactive\n')).to.equal(
        'it is not JSON, and the portal reads YAML only when it holds a key'
      );
    });

    it('treats a document that is not an object as no specification', () => {
      expect(readJson([1, 2]).format()).to.deep.equal({ supported: false, format: null });
      expect(readJson('text').format()).to.deep.equal({ supported: false, format: null });
    });

    it('reads a document written with a byte-order mark', () => {
      expect(readJson({ openapi: '3.0.0' }, BYTE_ORDER_MARK).format()).to.deep.equal({ supported: true });
      expect(read(`${BYTE_ORDER_MARK}openapi: 3.0.0\n`).format()).to.deep.equal({ supported: true });
    });
  });

  describe('format', () => {
    const cases: [string, Record<string, unknown>, SpecFormat][] = [
      ['OpenAPI 3.0.4', { openapi: '3.0.4' }, { supported: true }],
      ['OpenAPI 3.1.0', { openapi: '3.1.0' }, { supported: true }],
      ['Swagger 2.0', { swagger: '2.0' }, { supported: false, format: 'Swagger 2.0' }],
      ['OpenAPI 2.0.0', { openapi: '2.0.0' }, { supported: false, format: 'OpenAPI 2.0.0' }],
      ['AsyncAPI 2.6.0', { asyncapi: '2.6.0' }, { supported: false, format: 'AsyncAPI 2.6.0' }],
      ['a Postman collection', { item: [], info: { schema: 'postman' } }, { supported: false, format: null }],
      ['a document with no version key', { paths: {} }, { supported: false, format: null }]
    ];

    cases.forEach(([label, document, expected]) => {
      it(`${expected.supported ? 'accepts' : 'refuses'} ${label}`, () => {
        expect(readJson({ ...document, info: {}, paths: {} }).format()).to.deep.equal(expected);
      });
    });

    it('names a version that is not a string rather than stringifying it', () => {
      expect(readJson({ swagger: 2 }).format()).to.deep.equal({ supported: false, format: 'Swagger 2' });
      expect(readJson({ swagger: { major: 2 } }).format()).to.deep.equal({
        supported: false,
        format: 'Swagger (unknown version)'
      });
    });
  });

  describe('suggestedSite', () => {
    it('takes the title and description from the document', () => {
      const site = withInfo({ title: 'Swagger Petstore', version: '1', description: 'Pets.' }).suggestedSite();

      expect(site).to.deep.equal({ name: 'Swagger Petstore', description: 'Pets.' });
    });

    it('reduces a title spanning several lines to one', () => {
      expect(withInfo({ title: 'Swagger\nPetstore', version: '1' }).suggestedSite().name).to.equal('Swagger Petstore');
    });

    it('caps a long description rather than stopping at its first line break', () => {
      const description = `First line of the summary.\n${'word '.repeat(200)}`;

      const site = withInfo({ title: 'API', version: '1', description }).suggestedSite();

      expect(site.description).to.have.length.greaterThan(200);
      expect(site.description).to.have.length.at.most(300);
      expect(site.description).to.not.include('\n');
    });

    it('stops the description at its first blank line', () => {
      const description = '\n\nThe calculator API.\nIt adds numbers.\n\n## Authentication\n\nUse a key.';

      expect(withInfo({ title: 'API', version: '1', description }).suggestedSite().description).to.equal(
        'The calculator API. It adds numbers.'
      );
    });

    it('cuts the description on a word boundary', () => {
      const description = 'sentence '.repeat(100).trim();

      const capped = withInfo({ title: 'API', version: '1', description }).suggestedSite().description;

      expect(capped).to.match(/sentence$/);
    });

    it('falls back to a placeholder when the document names no title', () => {
      expect(withInfo({ version: '1' }).suggestedSite()).to.deep.equal({ name: 'My API', description: null });
    });

    it('keeps the description when only the title is missing', () => {
      expect(withInfo({ version: '1', description: 'Pets, and how to get them.' }).suggestedSite()).to.deep.equal({
        name: 'My API',
        description: 'Pets, and how to get them.'
      });
    });

    it('ignores a title that is only whitespace', () => {
      expect(withInfo({ title: '  \n  ', version: '1' }).suggestedSite().name).to.equal('My API');
    });

    it('copes with a document that has no info block at all', () => {
      expect(readJson({ openapi: '3.0.0' }).suggestedSite().name).to.equal('My API');
    });
  });

  describe('endpoints', () => {
    it('reads YAML as the portal bundler does, merging keys and allowing many aliases', () => {
      const aliases = Array.from({ length: 150 }, (_, index) => `  a${index}: *ops`);
      const yaml = [
        'openapi: 3.0.0',
        'ops: &ops',
        '  get: {}',
        'paths:',
        '  /merged:',
        '    <<: *ops',
        'many:',
        ...aliases
      ].join('\n');

      expect(read(yaml).endpoints().map(String)).to.deep.equal(['GET /merged']);
    });

    it('lists the inline operations of every path, leaving a path item in another file to its reference', () => {
      const document = readJson({
        openapi: '3.0.0',
        paths: { '/pets': { summary: 'Pets', get: {}, post: {} }, '/health': { $ref: './health.yaml' } }
      });

      expect(document.endpoints().map(String)).to.deep.equal(['GET /pets', 'POST /pets']);
    });

    it('follows a path item that is a reference into the document, letting its siblings add operations', () => {
      const document = readJson({
        openapi: '3.1.0',
        paths: {
          '/owners': { $ref: '#/components/pathItems/Owners', delete: {} },
          '/pets~1{id}': { $ref: '#/components/pathItems/Alias' }
        },
        components: { pathItems: { Owners: { get: {} }, Alias: { $ref: '#/x-items/pets~1one' } } },
        'x-items': { 'pets/one': { put: {} } }
      });

      expect(document.endpoints().map(String)).to.deep.equal(['GET /owners', 'DELETE /owners', 'PUT /pets~1{id}']);
    });

    it('survives a path item that refers to itself', () => {
      const document = readJson({ openapi: '3.1.0', paths: { '/loop': { $ref: '#/paths/~1loop' } } });

      expect(document.endpoints()).to.be.empty;
    });
  });

  describe('pathItemReferences', () => {
    const specDirectory = new DirectoryPath('/project/src/spec');
    const references = (paths: Record<string, unknown>) =>
      readJson({ openapi: '3.0.0', paths })
        .pathItemReferences(specDirectory)
        .map(({ path: route, file, pointer }) => [route, String(file), pointer]);

    it('resolves a path item in another file against the directory the document sits in', () => {
      expect(
        references({ '/pets': { $ref: './paths/pets.yaml' }, '/owners': { $ref: '../shared.yaml#/Owners' } })
      ).to.deep.equal([
        ['/pets', path.resolve('/project/src/spec/paths/pets.yaml'), ''],
        ['/owners', path.resolve('/project/src/shared.yaml'), '/Owners']
      ]);
    });

    it('ignores inline path items, references into the document, and URLs', () => {
      expect(
        references({
          '/inline': { get: {} },
          '/local': { $ref: '#/components/pathItems/Local' },
          '/remote': { $ref: 'https://example.com/pets.yaml' }
        })
      ).to.be.empty;
    });
  });

  describe('schemaIds', () => {
    it('names each $id the document declares, however deep', () => {
      const document = readJson({ Pet: { $id: 'pet.json', properties: { tag: { $id: 'tag.json' } } } });

      expect([...document.schemaIds()]).to.deep.equal(['pet.json', 'tag.json']);
    });
  });

  describe('referencedFiles', () => {
    const specDirectory = new DirectoryPath('/project/src/spec');
    const referenced = (document: unknown, rootIds = new Set<string>()) =>
      readJson(document).referencedFiles(specDirectory, rootIds).map(String);
    const inSpec = (file: string) => path.resolve('/project/src/spec', file);

    it('finds a $ref on any object, in data, extensions and lists too, against the folder of the document', () => {
      const files = referenced({
        openapi: '3.0.0',
        paths: { '/pets': { $ref: './paths/pets.yaml' } },
        components: {
          schemas: { Pet: { allOf: [{ $ref: 'schemas/Base.yaml' }] } },
          examples: { Pet: { value: { $ref: 'examples/pet.json' } } }
        },
        'x-shared': { $ref: '../shared/owners.yaml#/Owner' }
      });

      expect(files).to.deep.equal([
        inSpec('paths/pets.yaml'),
        inSpec('schemas/Base.yaml'),
        inSpec('examples/pet.json'),
        path.resolve('/project/src/shared/owners.yaml')
      ]);
    });

    it('reads no further into an object with a $ref, as the bundler does not', () => {
      const files = referenced({ Pet: { $ref: './pet.yaml', properties: { owner: { $ref: './owner.yaml' } } } });

      expect(files).to.deep.equal([inSpec('pet.yaml')]);
    });

    it('leaves out references into the document, URLs, and what the bundler has embedded', () => {
      const files = referenced({
        local: { $ref: '#/components/schemas/Pet' },
        remote: { $ref: 'https://example.com/pet.yaml' },
        'x-ext': { abc123: { $ref: './embedded.yaml' } },
        'x-ext-urls': { abc123: { $ref: './mapped.yaml' } }
      });

      expect(files).to.be.empty;
    });

    it('reads no further below an $id, against which the bundler resolves what is under it', () => {
      expect(referenced({ Pet: { $id: 'pet.json', properties: { tag: { $ref: './tag.yaml' } } } })).to.be.empty;
    });

    // The bundler takes the $ids of the document it starts from, and only those, as names of schemas.
    it('leaves out a reference naming an $id of the root document, as a schema rather than a file', () => {
      const files = referenced(
        { owner: { $ref: 'pet.json#/properties/tag' }, tag: { $ref: './tag.yaml' } },
        new Set(['pet.json'])
      );

      expect(files).to.deep.equal([inSpec('tag.yaml')]);
    });

    it('follows a reference in a document that is a list', () => {
      expect(referenced([{ name: 'limit' }, { $ref: './parameters/offset.yaml' }])).to.deep.equal([
        inSpec('parameters/offset.yaml')
      ]);
    });

    it('reads a backslash as a slash, and leaves a percent escape as written', () => {
      const files = referenced({ a: { $ref: '.\\schemas\\Pet.yaml' }, b: { $ref: './my%20pet.yaml' } });

      expect(files).to.deep.equal([inSpec('schemas/Pet.yaml'), inSpec('my%20pet.yaml')]);
    });

    it('survives an alias that holds itself', () => {
      const document = read('openapi: 3.0.0\nloop: &loop\n  again: *loop\n  next: { $ref: ./next.yaml }\n');

      expect(document.referencedFiles(specDirectory, new Set()).map(String)).to.deep.equal([inSpec('next.yaml')]);
    });
  });

  describe('endpointsAt', () => {
    it('names the operations of the path item a pointer locates after the path it is mounted at', () => {
      const file = readJson({ get: {}, 'x-library': { owners: { post: {} } } });

      expect(file.endpointsAt('/pets', '').map(String)).to.deep.equal(['GET /pets']);
      expect(file.endpointsAt('/owners', '/x-library/owners').map(String)).to.deep.equal(['POST /owners']);
      expect(file.endpointsAt('/missing', '/nowhere')).to.be.empty;
    });
  });
});
