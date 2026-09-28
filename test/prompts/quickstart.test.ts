import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { QuickstartPrompts } from '../../src/prompts/quickstart.js';
import { convertToOpenApi3 } from '../../src/prompts/portal/source.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { FileName } from '../../src/types/file/fileName.js';
import { FilePath } from '../../src/types/file/filePath.js';
import { UrlPath } from '../../src/types/file/urlPath.js';

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

  describe('specValidationFailed', () => {
    let message: sinon.SinonStub;
    const tip = () => stripVTControlCharacters(String(message.firstCall.args[0]));

    beforeEach(() => {
      message = sinon.stub(log, 'message');
    });

    it('suggests validating a local spec by its file with an AI agent', () => {
      const spec = new FilePath(specs, new FileName('petstore.json'));
      prompts.specValidationFailed(spec);

      expect(tip()).to.contain(`apimatic api validate --file=${spec}`);
      expect(tip()).to.contain('AI coding agent');
    });

    it('suggests validating a spec that came from a URL by that URL', () => {
      prompts.specValidationFailed(new UrlPath('https://example.com/openapi.json'));

      expect(tip()).to.contain('apimatic api validate --url=https://example.com/openapi.json');
    });
  });
});
