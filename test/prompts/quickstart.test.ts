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
import { ServiceError } from '../../src/infrastructure/service-error.js';

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

  // The file checked is the wizard's copy in a temporary directory, which the user never chose.
  it('names the spec by its file name, not by where the wizard copied it', () => {
    prompts.specFormatUnsupported(new FilePath(specs, new FileName('petstore.json')), 'Swagger 2.0');

    expect(printed()[0]).to.match(/^'petstore\.json' is Swagger 2\.0/);
  });

  it('names an address that failed to download, and asks again for a file that is not there', () => {
    const url = new UrlPath('https://example.com/openapi.json');
    prompts.specUnavailable({ kind: 'downloadFailed', url, error: ServiceError.NetworkError });
    prompts.specUnavailable({ kind: 'fileUnreadable', file: new FilePath(specs, new FileName('missing.json')) });

    expect(printed()[0]).to.contain(`Could not download ${url}.`);
    expect(printed()[1]).to.equal(
      'The specified file does not exist or is not a valid file. Please enter a valid file path.'
    );
  });

  it('says a project without apimatic.json is not set up, and how to go on', () => {
    const message = sinon.stub(log, 'message');

    prompts.configMissing(new DirectoryPath('project').join('src'));

    expect(printed()[0]).to.contain('apimatic.json');
    expect(stripVTControlCharacters(String(message.firstCall.args[0]))).to.contain('apimatic quickstart');
  });

  it('gives a spec that names no OpenAPI version the fix portal generate gives', () => {
    prompts.specNotRecognised(new FilePath(specs, new FileName('calculator.raml')));

    expect(printed()[0]).to.contain(fix);
  });

  describe('specValidationFailed', () => {
    let write: sinon.SinonStub;
    // Boxed or not depending on the terminal's width, but each of these stays on a line of its own.
    const howToFix = () => stripVTControlCharacters(write.args.map(([chunk]) => String(chunk)).join(''));

    beforeEach(() => {
      write = sinon.stub(process.stdout, 'write').returns(true);
    });

    it('suggests an AI agent run validate on a local spec, or the VS Code extension', () => {
      prompts.specValidationFailed('file');
      write.restore();

      expect(howToFix()).to.contain('How to fix');
      expect(howToFix()).to.contain('Ask an AI coding agent to run this command and fix what it reports:');
      expect(howToFix()).to.contain('apimatic api validate --file=<path>');
      expect(howToFix()).to.contain("Or use APIMatic's interactive VS Code Extension:");
      expect(howToFix()).to.contain(
        'https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode'
      );
    });

    it('suggests validating a spec that came from a URL by its URL', () => {
      prompts.specValidationFailed('url');
      write.restore();

      expect(howToFix()).to.contain('apimatic api validate --url=<url>');
    });

    it("names validate inline and with no flags for a project's spec/", () => {
      prompts.specValidationFailed('project');
      write.restore();

      expect(howToFix()).to.contain('Ask an AI coding agent to run apimatic api validate and fix what it reports.');
      expect(howToFix()).not.to.contain('--');
    });
  });
});
