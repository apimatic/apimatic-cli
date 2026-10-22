import path from 'path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FilePath } from '../../../src/types/file/filePath';
import { CodeSampleCatalog, CodeSampleCatalogs, CodeSamplesFile } from '../../../src/types/portal/code-samples';
import { Endpoint } from '../../../src/types/portal/endpoint';
import { PortalSpec } from '../../../src/types/portal/portal-source';
import { Language } from '../../../src/types/sdk/generate';

const SPEC_DIRECTORY = new DirectoryPath(path.resolve('portal', 'src', 'spec'));

const catalog = (language: Language, json: object): CodeSampleCatalog => {
  const parsed = CodeSampleCatalog.fromJson(language, { webhooks: {}, ...json });
  expect(parsed, `unparsable: ${JSON.stringify(json)}`).to.not.be.undefined;
  return parsed as CodeSampleCatalog;
};

/** A spec at `file`, relative to `spec/`, declaring each of `endpoints` ("GET /status"). */
const spec = (slug: string, file: string, endpoints: string[]): PortalSpec => ({
  slug,
  file: FilePath.resolve(SPEC_DIRECTORY, file),
  endpoints: endpoints.map((endpoint) => {
    const [method, route] = endpoint.split(' ');
    return new Endpoint(method, route);
  })
});

const placed = (catalogs: CodeSampleCatalog[], specs: PortalSpec[]): CodeSamplesFile =>
  new CodeSampleCatalogs(catalogs).placedOn(specs, SPEC_DIRECTORY).toJson();

const typescript = (call: string) => ({ lang: 'typescript', label: 'TypeScript', sources: { Example: call } });
const csharp = (call: string) => ({ lang: 'csharp', label: 'C#', sources: { Example: call } });

describe('CodeSampleCatalog', () => {
  it('rejects a catalog that is not the wire shape', () => {
    expect(CodeSampleCatalog.fromJson(Language.TYPESCRIPT, [])).to.be.undefined;
    expect(CodeSampleCatalog.fromJson(Language.TYPESCRIPT, { webhooks: {} })).to.be.undefined;
    expect(CodeSampleCatalog.fromJson(Language.TYPESCRIPT, { paths: { '/a': { GET: { x: 1 } } } })).to.be.undefined;
  });

  it('rejects samples filed by spec that are not the wire shape', () => {
    const filed = (specs: unknown) => CodeSampleCatalog.fromJson(Language.TYPESCRIPT, { paths: {}, specs });

    expect(filed([])).to.be.undefined;
    expect(filed({ 'a/a.json': {} })).to.be.undefined;
    expect(filed({ 'a/a.json': { paths: { '/a': { GET: { x: 1 } } } } })).to.be.undefined;
  });
});

describe('PlacedCodeSamples', () => {
  const placedOn = (catalogs: CodeSampleCatalog[], specs: PortalSpec[]) =>
    new CodeSampleCatalogs(catalogs).placedOn(specs, SPEC_DIRECTORY);

  /** Each spec named by its path from `spec/`, or null for the samples not filed by spec. */
  const named = (file: FilePath | null) => (file === null ? null : file.relativeTo(SPEC_DIRECTORY));

  describe('the operations shown with no SDK sample', () => {
    const alpha = spec('alpha', 'alpha/openapi.json', ['GET /status', 'GET /alpha']);
    const beta = spec('beta', 'beta/openapi.json', ['GET /status', 'POST /status', 'GET /beta']);
    const unfiled = catalog(Language.TYPESCRIPT, { paths: { '/status': { GET: { Example: 'status' } } } });

    it('names each operation more than one spec declares, with the specs that do', () => {
      const shared = placedOn([unfiled], [alpha, beta]).sharedEndpoints();

      expect(shared.map(({ key, files }) => [`${key}`, files.map(named)])).to.deep.equal([
        ['GET /status', ['alpha/openapi.json', 'beta/openapi.json']]
      ]);
    });

    it('names none when no two specs declare the same operation', () => {
      const gamma = spec('gamma', 'gamma/openapi.json', ['GET /gamma']);

      expect(placedOn([unfiled], [alpha, gamma]).sharedEndpoints()).to.be.empty;
    });

    it('names none when the samples are filed by spec, each spec showing its own', () => {
      const filed = catalog(Language.TYPESCRIPT, {
        paths: { '/status': { GET: { Example: 'alpha status' } } },
        specs: {
          'alpha/openapi.json': { paths: { '/status': { GET: { Example: 'alpha status' } } } },
          'beta/openapi.json': { paths: { '/status': { GET: { Example: 'beta status' } } } }
        }
      });

      expect(placedOn([filed], [alpha, beta]).sharedEndpoints()).to.be.empty;
    });
  });

  describe('the samples no operation takes', () => {
    it('names, of the samples not filed by spec, those no spec declares, once across languages', () => {
      const unplaced = placedOn(
        [
          catalog(Language.TYPESCRIPT, {
            paths: { '/pets': { GET: { Example: 'a' } }, '/owners': { GET: { Example: 'b' } } }
          }),
          catalog(Language.CSHARP, { paths: { '/owners': { GET: { Example: 'c' } } } })
        ],
        [spec('pets', 'openapi.json', ['GET /pets'])]
      ).unplaced();

      expect(unplaced.map(({ spec, endpoints }) => [named(spec), endpoints.map(String)])).to.deep.equal([
        [null, ['GET /owners']]
      ]);
    });

    it('names, of the samples filed under a spec, those it does not declare, and checks nothing else', () => {
      const unplaced = placedOn(
        [
          catalog(Language.TYPESCRIPT, {
            paths: { '/orders': { GET: { Example: 'orders' } }, '/refunds': { POST: { Example: 'refund' } } },
            specs: {
              'orders/openapi.yaml': {
                paths: { '/orders': { GET: { Example: 'orders' } }, '/refunds': { POST: { Example: 'refund' } } }
              },
              'gamma/openapi.json': { paths: { '/gamma': { GET: { Example: 'gamma' } } } }
            }
          })
        ],
        [spec('orders', 'orders/openapi.yaml', ['GET /orders'])]
      ).unplaced();

      expect(unplaced.map(({ spec, endpoints }) => [named(spec), endpoints.map(String)])).to.deep.equal([
        ['orders/openapi.yaml', ['POST /refunds']]
      ]);
    });
  });

  describe('samples not filed by spec', () => {
    const calculator = spec('calculator', 'openapi.json', ['GET /pets', 'POST /pets']);

    it('keys each endpoint by path and upper-case method, languages in catalog order, labelled by name alone', () => {
      const file = placed(
        [
          catalog(Language.TYPESCRIPT, { paths: { '/pets': { get: { Example: 'a' }, POST: { Example: 'b' } } } }),
          catalog(Language.CSHARP, { paths: { '/pets': { GET: { Example: 'c' } } } })
        ],
        [calculator]
      );

      expect(file).to.deep.equal({
        paths: { '/pets': { GET: [typescript('a'), csharp('c')], POST: [typescript('b')] } },
        specs: {}
      });
    });

    it('keeps every example of an operation in declaration order, one named Example among them', () => {
      const file = placed(
        [catalog(Language.PYTHON, { paths: { '/pets': { POST: { minimal: 'a', Example: 'x', full: 'b' } } } })],
        [calculator]
      );

      expect(Object.keys(file.paths['/pets'].POST[0].sources)).to.deep.equal(['minimal', 'Example', 'full']);
    });

    // One sample per method and path, which would be another API's call on all but one of the pages.
    it('leaves out an operation two specs declare, in every language, and keeps the rest', () => {
      const specs = [
        spec('alpha', 'alpha/alpha.json', ['GET /status', 'GET /alpha']),
        spec('beta', 'beta/beta.json', ['GET /status'])
      ];

      const file = placed(
        [
          catalog(Language.TYPESCRIPT, {
            paths: { '/status': { GET: { Example: 'alpha status' } }, '/alpha': { GET: { Example: 'alpha' } } }
          }),
          catalog(Language.CSHARP, { paths: { '/status': { GET: { Example: 'Alpha status' } } } })
        ],
        specs
      );

      expect(file).to.deep.equal({ paths: { '/alpha': { GET: [typescript('alpha')] } }, specs: {} });
    });

    it('reads an empty set of samples by spec as none', () => {
      const file = placed(
        [catalog(Language.TYPESCRIPT, { paths: { '/pets': { GET: { Example: 'a' } } }, specs: {} })],
        [calculator]
      );

      expect(file).to.deep.equal({ paths: { '/pets': { GET: [typescript('a')] } }, specs: {} });
    });
  });

  describe('samples filed by spec', () => {
    const orders = spec('orders', 'orders/openapi.yaml', ['GET /status', 'GET /orders']);
    const inventory = spec('inventory', 'inventory/openapi.json', ['GET /status', 'GET /stock']);

    /** As the platform files the two: `paths` holds the first operation on `GET /status` it reached. */
    const filed = (language: Language, prefix: string) =>
      catalog(language, {
        paths: {
          '/status': { GET: { Example: `${prefix} orders status` } },
          '/orders': { GET: { Example: `${prefix} orders` } },
          '/stock': { GET: { Example: `${prefix} stock` } }
        },
        specs: {
          'orders/openapi.yaml': {
            paths: {
              '/status': { GET: { Example: `${prefix} orders status` } },
              '/orders': { GET: { Example: `${prefix} orders` } }
            }
          },
          'inventory/openapi.json': {
            paths: {
              '/status': { GET: { Example: `${prefix} inventory status` } },
              '/stock': { GET: { Example: `${prefix} stock` } }
            }
          }
        }
      });

    it('gives each spec its own samples, its own call on an operation both declare, and none from paths', () => {
      expect(placed([filed(Language.TYPESCRIPT, 'ts')], [orders, inventory])).to.deep.equal({
        paths: {},
        specs: {
          orders: {
            '/status': { GET: [typescript('ts orders status')] },
            '/orders': { GET: [typescript('ts orders')] }
          },
          inventory: {
            '/status': { GET: [typescript('ts inventory status')] },
            '/stock': { GET: [typescript('ts stock')] }
          }
        }
      });
    });

    it("keeps languages in catalog order within a spec's own samples", () => {
      const file = placed([filed(Language.TYPESCRIPT, 'ts'), filed(Language.CSHARP, 'cs')], [orders, inventory]);

      expect(file.specs.inventory['/status'].GET).to.deep.equal([
        typescript('ts inventory status'),
        csharp('cs inventory status')
      ]);
    });

    it('gives a spec nothing for an operation its own samples leave out, though paths has it', () => {
      const file = placed(
        [
          catalog(Language.TYPESCRIPT, {
            paths: { '/status': { GET: { Example: 'inventory status' } }, '/stock': { GET: { Example: 'stock' } } },
            specs: { 'inventory/openapi.json': { paths: { '/status': { GET: { Example: 'inventory status' } } } } }
          })
        ],
        [inventory]
      );

      expect(file).to.deep.equal({
        paths: {},
        specs: { inventory: { '/status': { GET: [typescript('inventory status')] } } }
      });
    });

    it('gives a spec with no samples of its own none at all', () => {
      const file = placed(
        [
          catalog(Language.TYPESCRIPT, {
            paths: { '/orders': { GET: { Example: 'orders' } }, '/stock': { GET: { Example: 'stock' } } },
            specs: { 'inventory/openapi.json': { paths: { '/stock': { GET: { Example: 'stock' } } } } }
          })
        ],
        [orders, inventory]
      );

      expect(file).to.deep.equal({ paths: {}, specs: { inventory: { '/stock': { GET: [typescript('stock')] } } } });
    });

    it('matches a spec in a nested folder by its path from spec/', () => {
      const nested = spec('orders', 'apis/orders/openapi.yaml', ['GET /orders']);

      const file = placed(
        [
          catalog(Language.TYPESCRIPT, {
            paths: { '/orders': { GET: { Example: 'orders' } } },
            specs: { 'apis/orders/openapi.yaml': { paths: { '/orders': { GET: { Example: 'orders' } } } } }
          })
        ],
        [nested]
      );

      expect(file.specs).to.deep.equal({ orders: { '/orders': { GET: [typescript('orders')] } } });
    });

    it('matches a spec by its path only as the platform writes it', () => {
      const group = { paths: { '/orders': { GET: { Example: 'orders' } } } };

      const file = placed(
        [
          catalog(Language.TYPESCRIPT, {
            paths: {},
            specs: {
              './orders/openapi.yaml': group,
              'orders\\openapi.yaml': group,
              'Orders/openapi.yaml': group,
              orders: group
            }
          })
        ],
        [orders]
      );

      expect(file).to.deep.equal({ paths: {}, specs: {} });
    });
  });
});
