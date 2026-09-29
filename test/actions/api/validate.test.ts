import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { SpecCheck, ValidateAction } from '../../../src/actions/api/validate.js';
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

const COMMAND_METADATA: CommandMetadata = { commandName: 'api validate', shell: 'test' };
const PASSED = { isSuccess: true, blocking: [], errors: [], warnings: [], information: [] };

describe('ValidateAction', () => {
  let workingDirectory: DirectoryPath;
  let prompts: sinon.SinonStubbedInstance<ApiValidatePrompts>;
  let validateViaFile: sinon.SinonStub;

  const project = () => ProjectContext.in(workingDirectory);

  const validate = (spec: ResourceInput, onChecked?: (check: SpecCheck) => void) =>
    new ValidateAction(workingDirectory, COMMAND_METADATA).execute(spec, true, onChecked);

  const expectUnchecked = async (spec: ResourceInput, problem: ServiceError | SpecZipProblem) => {
    let check: SpecCheck | undefined;

    expect((await validate(spec, (checked) => (check = checked))).isFailed()).to.be.true;
    expect(check).to.equal('unchecked');
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

    await expectUnchecked(new UrlPath('https://example.org/openapi.json'), ServiceError.NetworkError);
  });
});
