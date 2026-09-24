import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PortalArtifactsService } from '../../../src/infrastructure/services/portal-artifacts-service';
import { ServiceErrorCode } from '../../../src/infrastructure/service-error';
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

    expect(result._unsafeUnwrap().samplesFor(new Endpoint('GET', '/payments'))).to.be.empty;
  });

  it('loads a catalog per language from the configured file', async () => {
    process.env.APIMATIC_CODE_SAMPLES_PATH = 'test/resources/code-samples.json';

    const result = await new PortalArtifactsService().generate();

    const samples = result._unsafeUnwrap().samplesFor(new Endpoint('GET', '/payments'));
    expect(samples.map((sample) => sample.lang)).to.deep.equal(['typescript', 'csharp', 'python']);
  });

  it('names the variable and the file when the file does not exist', async () => {
    const missing = path.join(root, 'missing.json');
    process.env.APIMATIC_CODE_SAMPLES_PATH = missing;

    const error = (await new PortalArtifactsService().generate())._unsafeUnwrapErr();

    expect(error.code).to.equal(ServiceErrorCode.NotFound);
    expect(error.errorMessage).to.contain('APIMATIC_CODE_SAMPLES_PATH').and.contain(missing);
  });

  it('names the variable and the file when the file is not JSON', async () => {
    withSamples('{ not json');

    const error = (await new PortalArtifactsService().generate())._unsafeUnwrapErr();

    expect(error.errorMessage).to.contain('APIMATIC_CODE_SAMPLES_PATH').and.contain('code-samples.json');
  });

  it('names the language whose catalog is malformed', async () => {
    withSamples(JSON.stringify({ python: { paths: [] } }));

    const error = (await new PortalArtifactsService().generate())._unsafeUnwrapErr();

    expect(error.errorMessage).to.contain('python');
  });

  it('skips a key that is not a language', async () => {
    withSamples(JSON.stringify({ version: 1, typescript: { paths: { '/payments': { GET: { Example: 'list()' } } } } }));

    const result = await new PortalArtifactsService().generate();

    const samples = result._unsafeUnwrap().samplesFor(new Endpoint('GET', '/payments'));
    expect(samples.map((sample) => sample.lang)).to.deep.equal(['typescript']);
  });
});
