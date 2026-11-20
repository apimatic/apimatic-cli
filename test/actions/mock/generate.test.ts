import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import sinon from 'sinon';
import { MockGenerateAction } from '../../../src/actions/mock/generate.js';
import { MockHost } from '../../../src/infrastructure/mock/mock-host.js';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { StubGenerationService } from '../../../src/infrastructure/services/stub-generation-service.js';
import { MockGeneratePrompts } from '../../../src/prompts/mock/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { optionsFor, running, send } from '../../helpers/mock-http.js';
import { TestRequest } from '../../helpers/mock-requests.js';
import { stubFixtures, successStub } from '../../helpers/mock-stubs.js';
import { cutShort, StubGenerationEndpoint } from '../../helpers/stub-generation-endpoint.js';

const stubFile = (operation: string, route: string) =>
  successStub({ name: `${operation} 200`, operation, path: route });

const NEW_SET = {
  '01-listAccounts.json': stubFile('listAccounts', '/v1/accounts'),
  '02-getHealth.json': stubFile('getHealth', '/health')
};

const OLD_SET = {
  '01-getHealth.json': stubFile('getHealth', '/health'),
  '02-listAccounts.json': stubFile('listAccounts', '/v1/accounts'),
  '03-deleteAccount.json': stubFile('deleteAccount', '/v1/accounts/1')
};

const zipOf = (files: Record<string, string>): Buffer => {
  const archive = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    archive.addFile(name, Buffer.from(content));
  }
  return archive.toBuffer();
};

const generateOverHttp = StubGenerationService.prototype.generateStubs;

describe('MockGenerateAction', () => {
  let root: string;
  let projectDirectory: string;
  let stubsDirectory: string;
  let prompts: sinon.SinonStubbedInstance<MockGeneratePrompts>;
  let generateStubs: sinon.SinonStub;
  /** The files of the build the service was handed, read while it runs: the build is gone once the action returns. */
  let uploaded: string[];

  const inProject = (...parts: string[]) => path.join(projectDirectory, ...parts);

  const write = (file: string, content = '') => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const holding = (files: Record<string, string>) => {
    for (const [name, content] of Object.entries(files)) {
      write(path.join(stubsDirectory, name), content);
    }
  };

  const held = () => (fs.existsSync(stubsDirectory) ? fs.readdirSync(stubsDirectory).sort() : []);

  const downloading = (download: Buffer) =>
    generateStubs.callsFake(async (build: FilePath) => {
      uploaded = new AdmZip(build.toString()).getEntries().map((entry) => entry.entryName);
      return ok(Readable.from([download]));
    });

  const execute = (force = false, destination = stubsDirectory) =>
    new MockGenerateAction(
      new DirectoryPath(root),
      { commandName: 'mock:generate', shell: 'test' },
      'auth-key'
    ).execute(ProjectContext.in(new DirectoryPath(projectDirectory)), new DirectoryPath(destination), force);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'apimatic-mock-generate-'));
    projectDirectory = path.join(root, 'payments');
    stubsDirectory = inProject('stubs');
    write(inProject('src', 'spec', 'openapi.json'), '{ "openapi": "3.1.0" }');
    uploaded = [];
    prompts = sinon.stub(MockGeneratePrompts.prototype);
    prompts.generateStubs.callsFake((run) => run);
    generateStubs = sinon.stub(StubGenerationService.prototype, 'generateStubs');
    downloading(zipOf(NEW_SET));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('before anything is sent', () => {
    it('refuses a destination that is the source directory, which it would empty', async () => {
      const result = await execute(true, inProject('src'));

      expect(result.isFailed()).to.be.true;
      expect(prompts.destinationContainsSource.calledOnce).to.be.true;
      expect(generateStubs.called).to.be.false;
      expect(fs.existsSync(inProject('src', 'spec', 'openapi.json'))).to.be.true;
    });

    it('refuses a destination that holds the source directory', async () => {
      const result = await execute(true, projectDirectory);

      expect(result.isFailed()).to.be.true;
      expect(generateStubs.called).to.be.false;
      expect(fs.existsSync(inProject('src', 'spec', 'openapi.json'))).to.be.true;
    });

    it('fails for a project without a src directory', async () => {
      fs.rmSync(inProject('src'), { recursive: true });

      const result = await execute();

      expect(result.isFailed()).to.be.true;
      expect(prompts.sourceDirectoryDoesNotExist.calledOnce).to.be.true;
      expect(generateStubs.called).to.be.false;
    });
  });

  describe('a stubs directory that already holds files', () => {
    beforeEach(() => holding(OLD_SET));

    it('is left alone when the question is answered no', async () => {
      prompts.overwriteStubs.resolves(false);

      const result = await execute();

      expect(result.isCancelled()).to.be.true;
      expect(generateStubs.called).to.be.false;
      expect(held()).to.deep.equal(Object.keys(OLD_SET));
    });

    it('is replaced when the question is answered yes', async () => {
      prompts.overwriteStubs.resolves(true);

      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(held()).to.deep.equal(Object.keys(NEW_SET));
    });

    it('is replaced without a question under --force', async () => {
      const result = await execute(true);

      expect(result.isSuccess()).to.be.true;
      expect(prompts.overwriteStubs.called).to.be.false;
    });

    it('keeps no file of the last set, so no stub is served twice', async () => {
      await execute(true);

      const files = held();

      expect(files).to.deep.equal(['01-listAccounts.json', '02-getHealth.json']);
    });
  });

  describe('a run that succeeds', () => {
    it('asks nothing about a stubs directory that is not there yet', async () => {
      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(prompts.overwriteStubs.called).to.be.false;
    });

    it('uploads the src directory of the project', async () => {
      await execute();

      expect(uploaded).to.deep.equal(['spec/openapi.json']);
    });

    it('writes the stub files of the download as they came', async () => {
      await execute();

      const written = Object.fromEntries(
        held().map((name) => [name, fs.readFileSync(path.join(stubsDirectory, name), 'utf8')])
      );

      expect(written).to.deep.equal(NEW_SET);
    });

    it('says where the stubs are and how many, for the line that serves them', async () => {
      await execute();

      const [directory, stubCount] = prompts.stubsGenerated.firstCall.args;

      expect([directory.toString(), stubCount]).to.deep.equal([stubsDirectory, 2]);
    });

    it('reads no apimatic.json and writes none', async () => {
      const result = await execute();

      expect(result.isSuccess()).to.be.true;
      expect(fs.existsSync(inProject('src', 'apimatic.json'))).to.be.false;
    });
  });

  describe('a run that fails leaves the stubs directory as it was', () => {
    beforeEach(() => holding(OLD_SET));

    it('when the stub files could not be generated, saying why', async () => {
      const refused = ServiceError.badRequest(
        'One or more validation errors occurred.\n- The specification has no paths.'
      );
      generateStubs.resolves(err(refused));

      const result = await execute(true);

      expect(result.isFailed()).to.be.true;
      expect(prompts.stubsNotGenerated.firstCall.args).to.deep.equal([refused]);
      expect(held()).to.deep.equal(Object.keys(OLD_SET));
    });

    it('when the download is no zip', async () => {
      downloading(Buffer.from('not a zip'));

      const result = await execute(true);

      expect(result.isFailed()).to.be.true;
      expect(prompts.downloadNotUnzipped.firstCall.args[0].kind).to.equal('unzipFailed');
      expect(held()).to.deep.equal(Object.keys(OLD_SET));
    });

    it('when mock serve would refuse a stub file, naming each problem', async () => {
      downloading(zipOf({ ...NEW_SET, '03-getHealth.json': NEW_SET['02-getHealth.json'], '04-broken.json': '{' }));

      const result = await execute(true);

      const [problems] = prompts.stubProblems.firstCall.args;
      expect(result.isFailed()).to.be.true;
      expect(problems.map((problem) => problem.file)).to.deep.equal(['03-getHealth.json', '04-broken.json']);
      expect(held()).to.deep.equal(Object.keys(OLD_SET));
    });

    it('when the download holds no stub at all', async () => {
      downloading(zipOf({ 'README.md': 'No operation of this specification can be stubbed.' }));

      const result = await execute(true);

      expect(result.isFailed()).to.be.true;
      expect(prompts.noStubsGenerated.calledOnce).to.be.true;
      expect(held()).to.deep.equal(Object.keys(OLD_SET));
    });
  });

  describe('against the endpoint, then served', () => {
    let endpoint: StubGenerationEndpoint;
    let host: MockHost | undefined;

    before(async () => {
      endpoint = await StubGenerationEndpoint.start();
    });

    after(() => endpoint.stop());

    beforeEach(() => {
      const specS = new AdmZip();
      specS.addLocalFolder(path.join(stubFixtures, 'spec-s'));
      endpoint.reset(specS.toBuffer());
      // The service as it is, paced for a test: its default waits 3 seconds before the first poll.
      const paced = new StubGenerationService({ pollIntervalMs: 1 });
      generateStubs.callsFake((...run: Parameters<typeof generateOverHttp>) => generateOverHttp.apply(paced, run));
    });

    afterEach(() => host?.stop());

    it('writes a stubs directory that mock serve answers from', async () => {
      const result = await execute();

      host = running(await MockHost.start(optionsFor(stubsDirectory)));
      const answer = await send(host.url, TestRequest.get('/health'));
      expect(result.isSuccess()).to.be.true;
      expect(endpoint.generateRequests.map((request) => request.url)).to.deep.equal([
        '/mock?origin=APIMATIC+CLI+mock:generate'
      ]);
      expect(host.stubs.all).to.have.length(84);
      expect(answer.status).to.equal(200);
    });

    it('keeps the last set when the download breaks part-way, and says the stubs were not generated', async () => {
      holding(OLD_SET);
      endpoint.download = cutShort(zipOf(NEW_SET).subarray(0, 40));

      const result = await execute(true);

      expect(result.isFailed()).to.be.true;
      expect(prompts.stubsNotGenerated.calledOnce).to.be.true;
      expect(held()).to.deep.equal(Object.keys(OLD_SET));
    });
  });
});
