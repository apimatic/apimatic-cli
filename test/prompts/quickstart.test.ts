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
    let write: sinon.SinonStub;
    // The section is boxed or not depending on the terminal's width; either way it reaches stdout.
    const howToFix = () =>
      stripVTControlCharacters(write.getCalls().map((call) => String(call.args[0])).join(''))
        .replace(/[│╮╯├─◇]/g, ' ')
        .replace(/\s+/g, ' ');

    beforeEach(() => {
      write = sinon.stub(process.stdout, 'write').returns(true);
    });

    it('suggests an AI agent run validate on a local spec, or the VS Code extension', () => {
      const spec = new FilePath(specs, new FileName('petstore.json'));
      prompts.specValidationFailed(spec);
      write.restore();

      expect(howToFix()).to.contain('How to fix');
      expect(howToFix()).to.contain(`Ask an AI coding agent to run apimatic api validate --file=${spec}`);
      expect(howToFix()).to.contain(
        "Or use APIMatic's interactive VS Code Extension: " +
          'https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode'
      );
    });

    it('names a spec that came from a URL by that URL', () => {
      prompts.specValidationFailed(new UrlPath('https://example.com/openapi.json'));
      write.restore();

      expect(howToFix()).to.contain('apimatic api validate --url=https://example.com/openapi.json');
    });
  });
});
