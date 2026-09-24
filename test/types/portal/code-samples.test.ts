import { expect } from 'chai';
import { CodeSampleCatalog, CodeSamples } from '../../../src/types/portal/code-samples';
import { Endpoint } from '../../../src/types/portal/endpoint';
import { Language } from '../../../src/types/sdk/generate';

const catalog = (language: Language, paths: unknown): CodeSampleCatalog => {
  const parsed = CodeSampleCatalog.fromJson(language, { paths, webhooks: {} });
  expect(parsed, `unparsable: ${JSON.stringify(paths)}`).to.not.be.undefined;
  return parsed as CodeSampleCatalog;
};

const samples = (codeSamples: CodeSamples, endpoint: Endpoint) =>
  codeSamples.samplesFor(endpoint).map(({ label, sources }) => ({ label, sources }));

describe('CodeSampleCatalog', () => {
  it('rejects a catalog that is not the wire shape', () => {
    expect(CodeSampleCatalog.fromJson(Language.TYPESCRIPT, [])).to.be.undefined;
    expect(CodeSampleCatalog.fromJson(Language.TYPESCRIPT, { webhooks: {} })).to.be.undefined;
    expect(CodeSampleCatalog.fromJson(Language.TYPESCRIPT, { paths: { '/a': { GET: { x: 1 } } } })).to.be.undefined;
  });

  it('looks a sample up by method whatever its case', () => {
    const typescript = catalog(Language.TYPESCRIPT, { '/pets': { GET: { Example: 'list()' } } });

    expect(typescript.sampleFor(new Endpoint('get', '/pets'))).to.not.be.undefined;
  });

  it('labels a sample with the language name alone', () => {
    const codeSamples = new CodeSamples([catalog(Language.CSHARP, { '/pets': { GET: { Example: 'List()' } } })]);

    expect(samples(codeSamples, new Endpoint('GET', '/pets'))).to.deep.equal([
      { label: 'C#', sources: { Example: 'List()' } }
    ]);
  });

  it('keeps every example of an operation in declaration order', () => {
    const codeSamples = new CodeSamples([
      catalog(Language.TYPESCRIPT, { '/pets': { POST: { minimal: 'a', full: 'b', basic: 'c' } } })
    ]);

    const [sample] = codeSamples.samplesFor(new Endpoint('POST', '/pets'));
    expect(Object.keys(sample.sources)).to.deep.equal(['minimal', 'full', 'basic']);
  });

  it('keeps an example named Example beside other examples', () => {
    const codeSamples = new CodeSamples([
      catalog(Language.PYTHON, { '/pets': { POST: { Example: 'x', minimal: 'a', full: 'b' } } })
    ]);

    expect(samples(codeSamples, new Endpoint('POST', '/pets'))).to.deep.equal([
      { label: 'Python', sources: { Example: 'x', minimal: 'a', full: 'b' } }
    ]);
  });
});

describe('CodeSamples', () => {
  it('gives one sample per language, in catalog order', () => {
    const codeSamples = new CodeSamples([
      catalog(Language.TYPESCRIPT, { '/pets': { POST: { minimal: 'a', full: 'b' } } }),
      catalog(Language.CSHARP, { '/pets': { POST: { minimal: 'c', full: 'd' } } })
    ]);

    expect(samples(codeSamples, new Endpoint('POST', '/pets')).map(({ label }) => label)).to.deep.equal([
      'TypeScript',
      'C#'
    ]);
  });

  it('has nothing for an operation a language has no sample for', () => {
    const codeSamples = new CodeSamples([catalog(Language.TYPESCRIPT, { '/pets': { GET: { Example: 'a' } } })]);

    expect(codeSamples.samplesFor(new Endpoint('DELETE', '/pets'))).to.be.empty;
  });

  it('names the samples no document has an operation for', () => {
    const codeSamples = new CodeSamples([
      catalog(Language.TYPESCRIPT, { '/pets': { GET: { Example: 'a' } }, '/owners': { GET: { Example: 'b' } } }),
      catalog(Language.CSHARP, { '/owners': { GET: { Example: 'c' } } })
    ]);

    expect(codeSamples.unplacedIn([new Endpoint('get', '/pets')])).to.deep.equal(['GET /owners']);
  });

  it("writes each endpoint's samples keyed by path and upper-case method, languages in catalog order", () => {
    const codeSamples = new CodeSamples([
      catalog(Language.TYPESCRIPT, { '/pets': { get: { Example: 'a' }, POST: { Example: 'b' } } }),
      catalog(Language.CSHARP, { '/pets': { GET: { Example: 'c' } } })
    ]);

    expect(codeSamples.toJson()).to.deep.equal({
      '/pets': {
        GET: [
          { lang: 'typescript', label: 'TypeScript', sources: { Example: 'a' } },
          { lang: 'csharp', label: 'C#', sources: { Example: 'c' } }
        ],
        POST: [{ lang: 'typescript', label: 'TypeScript', sources: { Example: 'b' } }]
      }
    });
  });
});
