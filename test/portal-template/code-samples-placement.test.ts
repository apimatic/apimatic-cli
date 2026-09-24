import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { stringify as toYaml } from 'yaml';
import { createOpenAPI } from 'fumadocs-openapi/server';
import type { Document } from 'fumadocs-openapi';
import { placeCodeSamples, readCodeSamples } from '../../portal-template/src/lib/code-samples.server';
import { bundleSpecification } from '../../portal-template/src/lib/openapi-bundle.server';

const EXTENSION = 'x-apimatic-codeSamples';

const typescript = (id: string) => ({ lang: 'typescript', label: 'TypeScript', sources: { [id]: `ts ${id}` } });

const operation = (summary: string) => ({ summary, responses: { '200': { description: 'ok' } } });

const placed = (document: object, samples: Parameters<typeof placeCodeSamples>[1]): any =>
  placeCodeSamples(JSON.parse(JSON.stringify(document)) as Document, samples);

describe('placeCodeSamples', () => {
  it('gives each operation the samples of its path and method', () => {
    const document = placed(
      { paths: { '/pets': { summary: 'Pets', get: operation('List'), post: operation('Create') } } },
      { '/pets': { POST: [typescript('create')] } }
    );

    expect(document.paths['/pets'].post[EXTENSION]).to.deep.equal([typescript('create')]);
    expect(document.paths['/pets'].get).to.not.have.property(EXTENSION);
    expect(document.paths['/pets'].summary).to.equal('Pets');
  });

  it('keeps the other keys of a path item and an operation, and their order', () => {
    const authored = [{ lang: 'go', label: 'Go', source: 'List()' }];
    const document = placed(
      {
        paths: {
          '/pets': {
            post: operation('Create'),
            parameters: [],
            get: { ...operation('List'), 'x-codeSamples': authored }
          }
        }
      },
      { '/pets': { GET: [typescript('list')] } }
    );

    expect(Object.keys(document.paths['/pets'])).to.deep.equal(['post', 'parameters', 'get']);
    expect(document.paths['/pets'].get['x-codeSamples']).to.deep.equal(authored);
  });

  it('leaves a document without paths as it was', () => {
    expect(placed({ openapi: '3.1.0', webhooks: {} }, {})).to.deep.equal({ openapi: '3.1.0', webhooks: {} });
  });

  it('replaces the samples an operation already carries, and drops them where the catalog has none', () => {
    const document = placed(
      {
        paths: {
          '/pets': { get: { ...operation('List'), [EXTENSION]: [typescript('stale')] } },
          '/owners': { get: { ...operation('Owners'), [EXTENSION]: [typescript('stale')] } }
        }
      },
      { '/pets': { GET: [typescript('fresh')] } }
    );

    expect(document.paths['/pets'].get[EXTENSION]).to.deep.equal([typescript('fresh')]);
    expect(document.paths['/owners'].get).to.not.have.property(EXTENSION);
  });

  it('drops the samples an operation carries when the build has no samples file', async () => {
    const written = { paths: { '/pets': { get: { ...operation('List'), [EXTENSION]: [typescript('own')] } } } };

    expect(placed(written, await readCodeSamples(null)).paths['/pets'].get).to.not.have.property(EXTENSION);
  });

  it('gives two paths that share one operation object their own samples', () => {
    const shared = operation('Shared');
    const document = placeCodeSamples(
      { paths: { '/a': { get: shared }, '/b': { get: shared } } } as unknown as Document,
      { '/a': { GET: [typescript('a')] }, '/b': { GET: [typescript('b')] } }
    ) as any;

    expect(document.paths['/a'].get[EXTENSION]).to.deep.equal([typescript('a')]);
    expect(document.paths['/b'].get[EXTENSION]).to.deep.equal([typescript('b')]);
    expect(shared).to.not.have.property(EXTENSION);
  });

  describe('after bundling', () => {
    let root: string;

    const write = (relative: string, value: unknown) => {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, relative.endsWith('.json') ? JSON.stringify(value) : toYaml(value));
      return target;
    };

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-samples-placement-'));
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('reaches the operations behind a path-item $ref, in another file or in the document', async () => {
      write('paths/pets.yaml', { get: operation('List pets') });
      const file = write('openapi.yaml', {
        openapi: '3.1.0',
        info: { title: 'Pets', version: '1' },
        paths: { '/pets': { $ref: './paths/pets.yaml' }, '/owners': { $ref: '#/components/pathItems/Owners' } },
        components: { pathItems: { Owners: { get: operation('List owners') } } }
      });
      const samplesFile = write('code-samples.json', {
        '/pets': { GET: [typescript('pets')] },
        '/owners': { GET: [typescript('owners')] }
      });

      const samples = await readCodeSamples(samplesFile);
      const server = createOpenAPI({
        input: { api: async () => placeCodeSamples(await bundleSpecification(file), samples) }
      });
      const document: any = (await server.getSchemas()).api.bundled;

      expect(document.paths['/pets'].get[EXTENSION]).to.deep.equal([typescript('pets')]);
      expect(document.paths['/owners'].get[EXTENSION]).to.deep.equal([typescript('owners')]);
    });
  });
});
