import { expect } from 'chai';
import path from 'path';
import { OpenApiDocument, SpecFormat } from '../../../src/types/portal/openapi-document';
import { FileName } from '../../../src/types/file/fileName';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { CodeSampleCatalog, CodeSamples } from '../../../src/types/portal/code-samples';
import { Language } from '../../../src/types/sdk/generate';

const JSON_FILE = new FileName('spec.json');
const YAML_FILE = new FileName('spec.yaml');
const BYTE_ORDER_MARK = '﻿';

describe('OpenApiDocument', () => {
  const read = (contents: string, fileName = JSON_FILE): OpenApiDocument => {
    const document = OpenApiDocument.parse(fileName, contents);
    expect(document, `unparsable: ${contents}`).to.not.be.undefined;
    return document as OpenApiDocument;
  };

  const readJson = (document: unknown, prefix = '') => read(prefix + JSON.stringify(document));
  const withInfo = (info: Record<string, unknown>) => readJson({ openapi: '3.0.0', info, paths: {} });

  describe('parse', () => {
    it('reads JSON by the .json extension and YAML by any other', () => {
      expect(readJson({ openapi: '3.1.0' }).format()).to.deep.equal({ supported: true });
      expect(read('openapi: 3.1.0\n', YAML_FILE).format()).to.deep.equal({ supported: true });
    });

    it('is undefined for text neither parser accepts', () => {
      expect(OpenApiDocument.parse(JSON_FILE, '{ not json')).to.be.undefined;
      expect(OpenApiDocument.parse(YAML_FILE, 'key: [unclosed')).to.be.undefined;
    });

    it('treats a document that is not an object as no specification', () => {
      expect(readJson([1, 2]).format()).to.deep.equal({ supported: false, format: null });
      expect(readJson('text').format()).to.deep.equal({ supported: false, format: null });
    });

    it('reads a document written with a byte-order mark', () => {
      expect(readJson({ openapi: '3.0.0' }, BYTE_ORDER_MARK).format()).to.deep.equal({ supported: true });
      expect(read(`${BYTE_ORDER_MARK}openapi: 3.0.0\n`, YAML_FILE).format()).to.deep.equal({ supported: true });
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

  describe('suggestedConfig', () => {
    it('takes the title and description from the document', () => {
      const config = withInfo({ title: 'Swagger Petstore', version: '1', description: 'Pets.' }).suggestedConfig();

      expect(config.siteTitle()).to.equal('Swagger Petstore');
      expect(config.siteDescription()).to.equal('Pets.');
    });

    it('reduces a title spanning several lines to one', () => {
      expect(withInfo({ title: 'Swagger\nPetstore', version: '1' }).suggestedConfig().siteTitle()).to.equal(
        'Swagger Petstore'
      );
    });

    it('caps a long description rather than stopping at its first line break', () => {
      const description = `First line of the summary.\n${'word '.repeat(200)}`;

      const config = withInfo({ title: 'API', version: '1', description }).suggestedConfig();

      expect(config.siteDescription()).to.have.length.greaterThan(200);
      expect(config.siteDescription()).to.have.length.at.most(300);
      expect(config.siteDescription()).to.not.include('\n');
    });

    it('cuts the description on a word boundary', () => {
      const description = 'sentence '.repeat(100).trim();

      const capped = withInfo({ title: 'API', version: '1', description }).suggestedConfig().siteDescription();

      expect(capped).to.match(/sentence$/);
    });

    it('falls back to a placeholder when the document names no title', () => {
      const config = withInfo({ version: '1' }).suggestedConfig();

      expect(config.siteTitle()).to.equal('My API');
      expect(config.siteDescription()).to.be.null;
    });

    it('keeps the description when only the title is missing', () => {
      const config = withInfo({ version: '1', description: 'Pets, and how to get them.' }).suggestedConfig();

      expect(config.siteTitle()).to.equal('My API');
      expect(config.siteDescription()).to.equal('Pets, and how to get them.');
    });

    it('ignores a title that is only whitespace', () => {
      expect(withInfo({ title: '  \n  ', version: '1' }).suggestedConfig().siteTitle()).to.equal('My API');
    });

    it('copes with a document that has no info block at all', () => {
      expect(readJson({ openapi: '3.0.0' }).suggestedConfig().siteTitle()).to.equal('My API');
    });
  });

  describe('withCodeSamples', () => {
    const EXTENSION = 'x-apimatic-codeSamples';
    const codeSamples = new CodeSamples([
      CodeSampleCatalog.fromJson(Language.TYPESCRIPT, {
        paths: {
          '/pets': { GET: { Example: 'list()' }, POST: { Example: 'create()' } },
          '/health': { GET: { Example: 'ping()' } }
        },
        webhooks: {}
      }) as CodeSampleCatalog
    ]);

    const sampled = (document: unknown) =>
      JSON.parse(readJson(document).withCodeSamples(codeSamples).serialize(JSON_FILE));

    it('adds the samples to each operation that has them', () => {
      const document = sampled({ openapi: '3.0.0', paths: { '/pets': { get: {}, post: {} } } });

      expect(document.paths['/pets'].get[EXTENSION][0].sources).to.deep.equal({ Example: 'list()' });
      expect(document.paths['/pets'].post[EXTENSION][0].sources).to.deep.equal({ Example: 'create()' });
    });

    it('leaves the keys of a path item that are not operations alone', () => {
      const pathItem = { summary: 'Pets', parameters: [{ name: 'id', in: 'query' }], servers: [], get: {} };

      const document = sampled({ openapi: '3.0.0', paths: { '/pets': pathItem } });

      expect(document.paths['/pets'].summary).to.equal('Pets');
      expect(document.paths['/pets'].parameters).to.deep.equal(pathItem.parameters);
      expect(document.paths['/pets'].servers).to.deep.equal([]);
      expect(document.paths['/pets'].parameters[0]).to.not.have.property(EXTENSION);
    });

    it('skips a path item that is itself a reference', () => {
      const document = sampled({ openapi: '3.0.0', paths: { '/health': { $ref: './health.yaml' } } });

      expect(document.paths['/health']).to.deep.equal({ $ref: './health.yaml' });
    });

    it('leaves the samples the author wrote alone', () => {
      const authored = [{ lang: 'go', label: 'Go', source: 'List()' }];

      const document = sampled({ openapi: '3.0.0', paths: { '/pets': { get: { 'x-codeSamples': authored } } } });

      expect(document.paths['/pets'].get['x-codeSamples']).to.deep.equal(authored);
      expect(document.paths['/pets'].get[EXTENSION]).to.have.length(1);
    });

    it('keeps the declaration order of paths and methods', () => {
      const document = sampled({ openapi: '3.0.0', paths: { '/pets': { post: {}, get: {} }, '/health': { get: {} } } });

      expect(Object.keys(document.paths)).to.deep.equal(['/pets', '/health']);
      expect(Object.keys(document.paths['/pets'])).to.deep.equal(['post', 'get']);
    });

    it('leaves a document without paths as it was', () => {
      expect(sampled({ openapi: '3.1.0', webhooks: {} })).to.deep.equal({ openapi: '3.1.0', webhooks: {} });
    });
  });

  describe('endpoints', () => {
    it('lists the inline operations of every path', () => {
      const document = readJson({
        openapi: '3.0.0',
        paths: { '/pets': { summary: 'Pets', get: {}, post: {} }, '/health': { $ref: './health.yaml' } }
      });

      expect(document.endpoints().map(String)).to.deep.equal(['GET /pets', 'POST /pets']);
    });
  });

  describe('referencedFiles', () => {
    const specDirectory = new DirectoryPath('/project/src/spec');
    const referenced = (ref: string) =>
      readJson({ openapi: '3.0.0', paths: { '/pets': { get: { responses: { 200: { $ref: ref } } } } } })
        .referencedFiles(specDirectory)
        .map(String);

    it('ignores internal references and URLs, which resolve the same from anywhere', () => {
      expect(referenced('#/components/responses/Ok')).to.be.empty;
      expect(referenced('https://example.com/common.yaml#/Ok')).to.be.empty;
    });

    it('resolves a file against the directory the document sits in, dropping the fragment', () => {
      expect(referenced('./common.yaml#/Ok')).to.deep.equal([path.resolve('/project/src/spec/common.yaml')]);
      expect(referenced('shared/common.yaml')).to.deep.equal([path.resolve('/project/src/spec/shared/common.yaml')]);
      expect(referenced('shared/../../common.yaml')).to.deep.equal([path.resolve('/project/src/common.yaml')]);
    });
  });

  describe('serialize', () => {
    it('writes YAML back as YAML and JSON as JSON', () => {
      const yaml = read('openapi: 3.0.0\npaths: {}\n', YAML_FILE);

      expect(yaml.serialize(YAML_FILE)).to.equal('openapi: 3.0.0\npaths: {}\n');
      expect(JSON.parse(yaml.serialize(JSON_FILE))).to.deep.equal({ openapi: '3.0.0', paths: {} });
    });
  });
});
