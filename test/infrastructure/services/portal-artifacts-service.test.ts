import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PortalArtifactsService } from '../../../src/infrastructure/services/portal-artifacts-service';
import { ServiceError } from '../../../src/infrastructure/service-error';
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

  it('fails when the configured file does not exist', async () => {
    process.env.APIMATIC_CODE_SAMPLES_PATH = path.join(root, 'missing.json');

    const result = await new PortalArtifactsService().generate();

    expect(result._unsafeUnwrapErr()).to.equal(ServiceError.NotFound);
  });

  it('fails on a catalog for an unknown language', async () => {
    withSamples(JSON.stringify({ cobol: { paths: {} } }));

    const result = await new PortalArtifactsService().generate();

    expect(result._unsafeUnwrapErr()).to.equal(ServiceError.InvalidResponse);
  });
});
