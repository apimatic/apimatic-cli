import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PortalArtifactsService } from '../../../src/infrastructure/services/portal-artifacts-service';
import { Endpoint } from '../../../src/types/portal/endpoint';

describe('PortalArtifactsService', () => {
  const exported = process.env.APIMATIC_CODE_SAMPLES_PATH;
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-artifacts-'));
    delete process.env.APIMATIC_CODE_SAMPLES_PATH;
  });

  afterEach(() => {
    if (exported === undefined) {
      delete process.env.APIMATIC_CODE_SAMPLES_PATH;
    } else {
      process.env.APIMATIC_CODE_SAMPLES_PATH = exported;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  const withSamples = (contents: string) => {
    const file = path.join(root, 'code-samples.json');
    fs.writeFileSync(file, contents);
    process.env.APIMATIC_CODE_SAMPLES_PATH = path.relative(process.cwd(), file);
  };

  it('returns no samples when no file is configured', async () => {
    const result = await new PortalArtifactsService().generate();

    expect(result._unsafeUnwrap().samples.samplesFor(new Endpoint('GET', '/payments'))).to.be.empty;
  });

  it('loads a catalog per language from the configured file', async () => {
    process.env.APIMATIC_CODE_SAMPLES_PATH = 'test/resources/code-samples.json';

    const result = await new PortalArtifactsService().generate();

    const samples = result._unsafeUnwrap().samples.samplesFor(new Endpoint('GET', '/payments'));
    expect(samples.map((sample) => sample.lang)).to.deep.equal(['typescript', 'csharp', 'python']);
  });

  it('names the file when it does not exist', async () => {
    const missing = path.join(root, 'missing.json');
    process.env.APIMATIC_CODE_SAMPLES_PATH = missing;

    const failure = (await new PortalArtifactsService().generate())._unsafeUnwrapErr();

    expect(failure).to.deep.equal({ file: missing, problem: { kind: 'missing' } });
  });

  it('reports a file that is not JSON', async () => {
    withSamples('{ not json');

    const failure = (await new PortalArtifactsService().generate())._unsafeUnwrapErr();

    expect(failure.file).to.equal(path.join(root, 'code-samples.json'));
    expect(failure.problem).to.deep.equal({ kind: 'invalidJson' });
  });

  it('names the language whose catalog is malformed', async () => {
    withSamples(JSON.stringify({ python: { paths: [] } }));

    const failure = (await new PortalArtifactsService().generate())._unsafeUnwrapErr();

    expect(failure.problem).to.deep.equal({ kind: 'malformedCatalogs', languages: ['python'] });
  });

  it('skips and reports a key that is not a language', async () => {
    withSamples(JSON.stringify({ typescipt: {}, typescript: { paths: { '/payments': { GET: { Example: 'list()' } } } } }));

    const { samples, ignoredKeys } = (await new PortalArtifactsService().generate())._unsafeUnwrap();

    expect(samples.samplesFor(new Endpoint('GET', '/payments')).map((sample) => sample.lang)).to.deep.equal([
      'typescript'
    ]);
    expect(ignoredKeys).to.deep.equal(['typescipt']);
  });
});
