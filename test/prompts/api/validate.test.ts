import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ApiValidatePrompts } from '../../../src/prompts/api/validate.js';

describe('ApiValidatePrompts', () => {
  const prompts = new ApiValidatePrompts();
  let info: sinon.SinonStub;

  const printed = () => stripVTControlCharacters(String(info.lastCall.args[0]));

  beforeEach(() => {
    info = sinon.stub(log, 'info');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('lintingFailed', () => {
    it("puts the rules for a project's spec/ in the APIMATIC-META.json beside it", () => {
      prompts.lintingFailed('project');

      expect(printed()).to.equal(
        "If a linting rule doesn't fit your API, turn it off or lower its severity in an 'APIMATIC-META.json' " +
          'beside your API definition:\n' +
          'https://docs.apimatic.io/v4/define-validate/validate-lint/configuring-validation'
      );
    });

    // A file or URL is uploaded on its own, so an APIMATIC-META.json next to it is never read.
    it('asks for the APIMATIC-META.json in a zip with a spec given as a file or URL', () => {
      prompts.lintingFailed('file');
      expect(printed()).to.contain("in an 'APIMATIC-META.json' zipped together with your API definition:\n");

      prompts.lintingFailed('url');
      expect(printed()).to.contain("in an 'APIMATIC-META.json' zipped together with your API definition:\n");
    });
  });
});
