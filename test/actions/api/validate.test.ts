import fs from 'node:fs';
import { Readable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { ValidateAction } from '../../../src/actions/api/validate.js';
import { ApiValidatePrompts } from '../../../src/prompts/api/validate.js';
import { ValidateViaFileParams, ValidationService } from '../../../src/infrastructure/services/validation-service.js';
import { FileDownloadService } from '../../../src/infrastructure/services/file-download-service.js';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { ResourceInput } from '../../../src/types/file/resource-input.js';
import { UrlPath } from '../../../src/types/file/urlPath.js';
import { ProjectContext, SpecZipProblem } from '../../../src/types/project-context.js';
import { ResolveProblem, ResourceContext } from '../../../src/types/resource-context.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'api validate', shell: 'test' };
const PASSED = { isSuccess: true, blocking: [], errors: [], warnings: [], information: [] };
const FAILED = { isSuccess: false, blocking: [], errors: ['bad'], warnings: [], information: [] };

describe('ValidateAction', () => {
  let workingDirectory: DirectoryPath;
  let prompts: sinon.SinonStubbedInstance<ApiValidatePrompts>;
  let validateViaFile: sinon.SinonStub;

  const project = () => ProjectContext.in(workingDirectory);

  const validate = (spec: ResourceInput | ResourceContext) =>
    new ValidateAction(workingDirectory, COMMAND_METADATA).execute(spec);

  const expectUnchecked = async (spec: ResourceInput, problem: ResolveProblem) => {
    const result = await validate(spec);

    expect(result.isFailed()).to.be.true;
    expect(result.getError()).to.equal('unchecked');
    expect(prompts.specUnavailable.calledOnceWithExactly(problem)).to.be.true;
    expect(validateViaFile.called).to.be.false;
  };

  beforeEach(() => {
    workingDirectory = new DirectoryPath(fs.mkdtempSync(path.join(os.tmpdir(), 'api-validate-')));
    prompts = sinon.stub(ApiValidatePrompts.prototype);
    prompts.validateApi.callsFake((fn) => fn);
    validateViaFile = sinon
      .stub(ValidationService.prototype, 'validateViaFile')
      .resolves(ok({ validation: PASSED, linting: PASSED } as never));
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(workingDirectory.toString(), { recursive: true, force: true });
  });

  it('uploads the archive a project makes of its spec/', async () => {
    const zip = new FilePath(workingDirectory, new FileName('spec.zip'));
    sinon.stub(ProjectContext.prototype, 'specZip').resolves(ok(zip));

    expect((await validate(project())).isSuccess()).to.be.true;
    expect((validateViaFile.firstCall.args[0] as ValidateViaFileParams).file).to.equal(zip);
  });

  it("reports why a project's spec/ could not be zipped, and asks nothing of the service", async () => {
    const problem: SpecZipProblem = { kind: 'noSpec', specDirectory: workingDirectory.join('src', 'spec') };
    sinon.stub(ProjectContext.prototype, 'specZip').resolves(err(problem));

    await expectUnchecked(project(), problem);
  });

  it('uploads a copy of a local file, under its own name', async () => {
    const spec = new FilePath(workingDirectory, new FileName('openapi.yaml'));
    fs.writeFileSync(spec.toString(), 'openapi: 3.0.3');
    let uploaded: { file: FilePath; contents: string } | undefined;
    // Read during the call: the copy is in a temporary directory the run removes.
    validateViaFile.callsFake(async ({ file }: ValidateViaFileParams) => {
      uploaded = { file, contents: fs.readFileSync(file.toString(), 'utf8') };
      return ok({ validation: PASSED, linting: PASSED } as never);
    });

    expect((await validate(spec)).isSuccess()).to.be.true;
    expect(uploaded?.file.isEqual(spec)).to.be.false;
    expect(uploaded?.file.name().toString()).to.equal('openapi.yaml');
    expect(uploaded?.contents).to.equal('openapi: 3.0.3');
  });

  it('reports a URL it could not download, and asks nothing of the service', async () => {
    sinon.stub(FileDownloadService.prototype, 'downloadFile').resolves(err(ServiceError.NetworkError));
    const url = new UrlPath('https://example.org/openapi.json');

    await expectUnchecked(url, { kind: 'downloadFailed', url, error: ServiceError.NetworkError });
  });

  it('reports a local file that does not exist, and asks nothing of the service', async () => {
    const missing = new FilePath(workingDirectory, new FileName('missing.json'));

    await expectUnchecked(missing, { kind: 'fileUnreadable', file: missing });
  });

  it('calls a spec the service finds errors in invalid', async () => {
    validateViaFile.resolves(ok({ validation: FAILED, linting: PASSED } as never));
    const spec = new FilePath(workingDirectory, new FileName('openapi.yaml'));
    fs.writeFileSync(spec.toString(), 'openapi: 3.0.3');

    const result = await validate(spec);

    expect(result.isFailed()).to.be.true;
    expect(result.getError()).to.equal('invalid');
  });

  it('calls a spec the service refuses outright invalid, and one it never answered for unchecked', async () => {
    const spec = new FilePath(workingDirectory, new FileName('openapi.yaml'));
    fs.writeFileSync(spec.toString(), 'openapi: 3.0.3');

    validateViaFile.resolves(err({ kind: 'rejected', message: 'Your API Definition is invalid.' }));
    expect((await validate(spec)).getError()).to.equal('invalid');

    validateViaFile.resolves(err({ kind: 'unavailable', message: 'Service unavailable' }));
    expect((await validate(spec)).getError()).to.equal('unchecked');
  });

  // Quickstart hands over a spec it has resolved already, and needs the file it resolved to afterwards.
  it('validates the file a context it is given resolved to, without resolving it again', async () => {
    const download = sinon
      .stub(FileDownloadService.prototype, 'downloadFile')
      .resolves(ok({ stream: Readable.from(['openapi: 3.0.3']), filename: new FileName('openapi.yaml') }));
    const spec = ResourceContext.resolveTo(
      new UrlPath('https://example.org/openapi.yaml'),
      workingDirectory.join('temp')
    );
    const resolved = (await spec.resolveTo())._unsafeUnwrap();

    expect((await validate(spec)).isSuccess()).to.be.true;
    expect(download.calledOnce).to.be.true;
    expect((validateViaFile.firstCall.args[0] as ValidateViaFileParams).file).to.equal(resolved);
    expect(fs.existsSync(resolved.toString()), 'the file outlives the validation').to.be.true;
  });
});
