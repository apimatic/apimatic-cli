import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { expect } from 'chai';
import { ServiceError, ServiceErrorCode } from '../../../src/infrastructure/service-error.js';
import { StubGenerationService } from '../../../src/infrastructure/services/stub-generation-service.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import {
  bare,
  GENERATION_ID,
  json,
  noAnswer,
  problem,
  redirect,
  StubGenerationEndpoint
} from '../../helpers/stub-generation-endpoint.js';

describe('StubGenerationService', () => {
  const AUTH_KEY = 'test-auth-key';
  // The command's id as oclif spells it, which is what the command passes.
  const metadata = { commandName: 'mock:generate', shell: 'bash' };

  let endpoint: StubGenerationEndpoint;
  let workDir: string;
  let buildPath: FilePath;
  let configDir: DirectoryPath;

  // Paced for a test: the defaults wait 3 seconds between polls and 30 minutes for a run.
  const quick = new StubGenerationService({ pollIntervalMs: 1, generationTimeoutMs: 5000 });

  const generateStubs = (service: StubGenerationService = quick, authKey: string | null = AUTH_KEY) =>
    service.generateStubs(buildPath, configDir, metadata, authKey);
  const errorFrom = (result: { _unsafeUnwrapErr(): unknown }) => result._unsafeUnwrapErr() as ServiceError;

  before(async () => {
    endpoint = await StubGenerationEndpoint.start();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-generation-service-'));
    fs.writeFileSync(path.join(workDir, 'build.zip'), Buffer.from('PK build-input'));
    buildPath = FilePath.create(path.join(workDir, 'build.zip'))!;
    // No config.json here, so the key a test passes is the only one there is.
    configDir = new DirectoryPath(workDir);
  });

  after(async () => {
    fs.rmSync(workDir, { recursive: true, force: true });
    await endpoint.stop();
  });

  beforeEach(() => endpoint.reset());

  describe('a run that succeeds', () => {
    it('uploads the build to /mock, polls its status and downloads the stub files once it has finished', async () => {
      const result = await generateStubs();

      expect(await text(result._unsafeUnwrap())).to.equal('PK stub-files');
      expect(endpoint.generateRequests).to.have.length(1);
      expect(endpoint.statusRequests.map((request) => request.url)).to.deep.equal([`/mock/${GENERATION_ID}/status`]);
      expect(endpoint.downloadRequests.map((request) => request.url)).to.deep.equal([
        `/mock/${GENERATION_ID}/download`
      ]);
    });

    it('sends the build as the multipart field named file, with the command as the origin', async () => {
      await generateStubs();

      const [request] = endpoint.generateRequests;
      expect(request.url).to.equal('/mock?origin=APIMATIC+CLI+mock:generate');
      expect(request.headers['content-type']).to.satisfy((type: string) =>
        type.startsWith('multipart/form-data; boundary=')
      );
      expect(request.body).to.include('name="file"');
      expect(request.body).to.include('PK build-input');
    });

    it('authenticates all three calls', async () => {
      await generateStubs();

      const requests = [...endpoint.generateRequests, ...endpoint.statusRequests, ...endpoint.downloadRequests];
      expect(requests.map((request) => request.headers.authorization)).to.deep.equal([
        `X-Auth-Key ${AUTH_KEY}`,
        `X-Auth-Key ${AUTH_KEY}`,
        `X-Auth-Key ${AUTH_KEY}`
      ]);
    });

    it('takes the redirect to the download as the end of the run, without following it', async () => {
      const result = await generateStubs();

      expect(result.isOk()).to.be.true;
      expect(endpoint.statusRequests).to.have.length(1);
      expect(endpoint.downloadRequests).to.have.length(1);
    });

    it('takes a Completed status body as the end of the run too', async () => {
      endpoint.status = json(200, { status: 'Completed' });

      const result = await generateStubs();

      expect(result.isOk()).to.be.true;
    });

    it('keeps polling through every status of a run under way', async () => {
      const underWay = ['Unknown', 'Queued', 'ExecutionStarted', 'GeneratingArtifacts'];
      endpoint.status = (response, attempt) =>
        (underWay[attempt - 1] ? json(200, { status: underWay[attempt - 1] }) : redirect)(response, attempt);

      const result = await generateStubs();

      expect(result.isOk()).to.be.true;
      expect(endpoint.statusRequests).to.have.length(5);
    });

    it('reads one last status before it gives up, for a run that finished during the wait', async () => {
      const impatient = new StubGenerationService({ pollIntervalMs: 20, generationTimeoutMs: 10 });

      const result = await generateStubs(impatient);

      expect(result.isOk()).to.be.true;
    });
  });

  describe('a run that does not start', () => {
    it('calls nothing without a key, and says how to log in', async () => {
      const error = errorFrom(await generateStubs(quick, null));

      expect(error.errorMessage).to.equal(ServiceError.unauthorizedWithHint(null).errorMessage);
      expect(endpoint.generateRequests).to.have.length(0);
    });

    it('says how to log in when the key is refused', async () => {
      endpoint.generate = bare(401);

      const error = errorFrom(await generateStubs());

      expect(error.code).to.equal(ServiceErrorCode.UnAuthorized);
      expect(error.errorMessage).to.equal(ServiceError.unauthorizedWithHint(null).errorMessage);
    });

    it('passes on why the build was refused', async () => {
      endpoint.generate = problem(400, {
        title: 'One or more validation errors occurred.',
        errors: { file: ['build file should be in valid zip format'] }
      });

      const error = errorFrom(await generateStubs());

      expect(error.code).to.equal(ServiceErrorCode.BadRequest);
      expect(error.errorMessage).to.equal(
        'One or more validation errors occurred.\n- build file should be in valid zip format'
      );
    });

    it('passes on why the subscription does not allow it', async () => {
      endpoint.generate = problem(403, {
        title: 'Access denied to resource.',
        errors: { '': ['Stub generation is not allowed on your subscription'] }
      });

      const error = errorFrom(await generateStubs());

      expect(error.code).to.equal(ServiceErrorCode.Forbidden);
      expect(error.errorMessage).to.equal(
        'Access denied to resource.\n- Stub generation is not allowed on your subscription'
      );
    });

    it('refuses an answer that names no run', async () => {
      endpoint.generate = json(202, {});

      const error = errorFrom(await generateStubs());

      expect(error.code).to.equal(ServiceErrorCode.InvalidResponse);
      expect(endpoint.statusRequests).to.have.length(0);
    });
  });

  describe('a run that does not finish', () => {
    it('lists every validation error of the specification', async () => {
      endpoint.status = json(200, {
        status: 'ValidationError',
        errors: { spec: ['The specification has no paths.', "The server URL '{host}' has no default."] }
      });

      const error = errorFrom(await generateStubs());

      expect(error.code).to.equal(ServiceErrorCode.BadRequest);
      expect(error.errorMessage).to.equal(
        'One or more validation errors occurred.' +
          '\n- The specification has no paths.' +
          "\n- The server URL '{host}' has no default."
      );
    });

    it('reports a failed run as a server error', async () => {
      endpoint.status = json(200, { status: 'Failed' });

      const error = errorFrom(await generateStubs());

      expect(error.code).to.equal(ServiceErrorCode.ServerError);
    });

    it('gives up once the time for a run is spent', async () => {
      const impatient = new StubGenerationService({ pollIntervalMs: 1, generationTimeoutMs: 15 });
      endpoint.status = json(200, { status: 'GeneratingArtifacts' });

      const error = errorFrom(await generateStubs(impatient));

      expect(error.code).to.equal(ServiceErrorCode.Timeout);
      expect(error.errorMessage).to.equal('Stub generation timed out.');
    });

    it('gives up on a status request that is never answered', async () => {
      const impatient = new StubGenerationService({ pollIntervalMs: 1, requestTimeoutMs: 30 });
      endpoint.status = noAnswer;

      const error = errorFrom(await generateStubs(impatient));

      expect(error.code).to.equal(ServiceErrorCode.NetworkError);
    });

    it('stops polling a run the server does not know', async () => {
      endpoint.status = bare(404);

      const error = errorFrom(await generateStubs());

      expect(error.code).to.equal(ServiceErrorCode.NotFound);
      expect(endpoint.statusRequests).to.have.length(1);
    });

    it('says how to log in when the key is refused while polling', async () => {
      endpoint.status = bare(401);

      const error = errorFrom(await generateStubs());

      expect(error.errorMessage).to.equal(ServiceError.unauthorizedWithHint(null).errorMessage);
    });
  });

  describe('a download that fails', () => {
    it('is reported as a server error', async () => {
      endpoint.download = json(500, { title: 'boom' });

      const error = errorFrom(await generateStubs());

      expect(error.code).to.equal(ServiceErrorCode.ServerError);
    });

    it('says how to log in when the key is refused', async () => {
      endpoint.download = bare(401);

      const error = errorFrom(await generateStubs());

      expect(error.errorMessage).to.equal(ServiceError.unauthorizedWithHint(null).errorMessage);
    });
  });
});
