import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { QuickstartPrompts } from '../../src/prompts/quickstart.js';
import { convertToOpenApi3 } from '../../src/prompts/portal/source.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { FileName } from '../../src/types/file/fileName.js';
import { FilePath } from '../../src/types/file/filePath.js';

describe('QuickstartPrompts', () => {
  const prompts = new QuickstartPrompts();
  const specs = new DirectoryPath('specs');
  const fix = stripVTControlCharacters(convertToOpenApi3());
  let error: sinon.SinonStub;

  // Without its colours, which picocolors adds on Windows and in CI whatever the terminal.
  const printed = () => error.getCalls().map((call) => stripVTControlCharacters(String(call.args[0])));

  beforeEach(() => {
    error = sinon.stub(log, 'error');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('names the format of a spec a portal cannot be built from, and the fix portal generate gives', () => {
    prompts.specFormatUnsupported(new FilePath(specs, new FileName('petstore.json')), 'Swagger 2.0');

    expect(printed()[0]).to.contain('Swagger 2.0');
    expect(printed()[0]).to.contain(fix);
  });

  it('gives a spec that names no OpenAPI version the fix portal generate gives', () => {
    prompts.specNotRecognised(new FilePath(specs, new FileName('calculator.raml')));

    expect(printed()[0]).to.contain(fix);
  });

  // The wizard prints what refused the document; this says what that means and where the rest is.
  it('says the errors stop a portal being built, and where to see the warnings too', () => {
    prompts.specValidationFailed();

    expect(printed()[0]).to.contain('A portal cannot be built from this API Definition');
    expect(printed()[0]).to.contain('api validate');
  });

  // The one tool that fixes these interactively, on whichever path the wizard gave up.
  it('names the VS Code extension when it gives up on a specification', () => {
    const info = sinon.stub(log, 'info');

    prompts.fixYourSpec();

    const said = stripVTControlCharacters(String(info.firstCall.args[0]));
    expect(said).to.contain('VS Code extension');
    expect(said).to.contain('marketplace.visualstudio.com');
    expect(said).to.contain('quickstart');
  });
});
