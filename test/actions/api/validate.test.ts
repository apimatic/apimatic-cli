import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sinon from 'sinon';
import { expect } from 'chai';
import { ok } from 'neverthrow';
import { SpecCheck, ValidateAction } from '../../../src/actions/api/validate.js';
import { ApiValidatePrompts } from '../../../src/prompts/api/validate.js';
import { ValidateViaFileParams, ValidationService } from '../../../src/infrastructure/services/validation-service.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { ProjectContext } from '../../../src/types/project-context.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'api validate', shell: 'test' };
const PASSED = { isSuccess: true, blocking: [], errors: [], warnings: [], information: [] };

describe('ValidateAction', () => {
  let projectDirectory: string;
  let prompts: sinon.SinonStubbedInstance<ApiValidatePrompts>;
  let validateViaFile: sinon.SinonStub;
  let uploaded: string[];

  const write = (relative: string, contents = '') => {
    const file = path.join(projectDirectory, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };

  const validate = (onChecked?: (check: SpecCheck) => void) =>
    new ValidateAction(new DirectoryPath(projectDirectory), COMMAND_METADATA).execute(
      ProjectContext.in(new DirectoryPath(projectDirectory)),
      true,
      onChecked
    );

  beforeEach(() => {
    projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'api-validate-'));
    prompts = sinon.stub(ApiValidatePrompts.prototype);
    prompts.validateApi.callsFake((fn) => fn);
    uploaded = [];
    // Read during the call: the archive is in a temporary directory the run removes.
    validateViaFile = sinon
      .stub(ValidationService.prototype, 'validateViaFile')
      .callsFake(async ({ file }: ValidateViaFileParams) => {
        uploaded = new AdmZip(file.toString()).getEntries().map((entry) => entry.entryName);
        return ok({ validation: PASSED, linting: PASSED } as never);
      });
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  });

  it('validates everything in spec/ together, so a document split across files arrives whole', async () => {
    write('src/spec/openapi.yaml', 'openapi: 3.0.3');
    write('src/spec/schemas/pet.yaml', 'type: object');

    expect((await validate()).isSuccess()).to.be.true;
    expect(uploaded).to.have.members(['openapi.yaml', 'schemas/pet.yaml']);
  });

  it('says where it looked, and asks nothing of the service, when spec/ holds nothing', async () => {
    fs.mkdirSync(path.join(projectDirectory, 'src', 'spec'), { recursive: true });
    let check: SpecCheck | undefined;

    expect((await validate((checked) => (check = checked))).isFailed()).to.be.true;
    expect(check).to.equal('unchecked');
    expect(prompts.noSpecInProject.calledOnce).to.be.true;
    expect(prompts.noSpecInProject.firstCall.args[0].toString()).to.equal(path.join(projectDirectory, 'src'));
    expect(validateViaFile.called).to.be.false;
  });
});
