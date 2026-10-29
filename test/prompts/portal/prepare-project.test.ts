import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { PreparePortalProjectPrompts } from '../../../src/prompts/portal/prepare-project.js';
import { ServiceAddress } from '../../../src/types/portal/config/service-address.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PortalSourceProblem } from '../../../src/types/portal/portal-source.js';
import { Language } from '../../../src/types/sdk/generate.js';

describe('PreparePortalProjectPrompts', () => {
  afterEach(() => {
    sinon.restore();
  });

  // A run delivers everything or nothing, so a gap is the server's to fix.
  it('names what the artifacts left out, and says to try again', () => {
    const error = sinon.stub(log, 'error');

    new PreparePortalProjectPrompts().artifactsIncomplete({ sdks: [Language.TYPESCRIPT], sdkDocs: [], plugin: true });

    expect(stripVTControlCharacters(String(error.firstCall.args[0]))).to.equal(
      "The portal artifacts did not include the SDK for 'typescript' and the context plugin, which the portal's " +
        "pages need. Try again, and if it keeps happening, reach out to our team at 'support@apimatic.io'."
    );
  });

  // Only the docs were missing, so the message must not send the reader looking for the SDK.
  it('names missing SDK docs as the docs', () => {
    const error = sinon.stub(log, 'error');

    new PreparePortalProjectPrompts().artifactsIncomplete({ sdks: [], sdkDocs: [Language.PYTHON], plugin: false });

    expect(stripVTControlCharacters(String(error.firstCall.args[0]))).to.contain(
      "did not include the SDK docs for 'python', which"
    );
  });

  describe("an Ask AI key it couldn't check", () => {
    const SERVICE = ServiceAddress.parse('https://example.com', 'APIMATIC_COPILOT_URL')._unsafeUnwrap();
    const warned = (error: ServiceError) => {
      const warn = sinon.stub(log, 'warn');
      new PreparePortalProjectPrompts().copilotKeyNotChecked(error, SERVICE);
      return stripVTControlCharacters(String(warn.firstCall.args[0]));
    };

    // The service's own "no such key" is an outcome, so these answers came from another site.
    it("says an address that doesn't answer as the service does may not be the service", () => {
      for (const error of [ServiceError.NotFound, ServiceError.InvalidResponse]) {
        sinon.restore();
        expect(warned(error)).to.contain(
          'could not be checked, because https://example.com did not answer as the Ask AI service does. The portal'
        );
      }
    });

    it("quotes the service's reason without doubling its full stop", () => {
      expect(warned(ServiceError.badRequest('Too many requests.', {}))).to.contain(
        'because https://example.com answered: Too many requests. The portal'
      );
    });
  });

  it('names the source directory it could not zip, and why', () => {
    const error = sinon.stub(log, 'error');

    new PreparePortalProjectPrompts().sourceNotZipped(
      { kind: 'zipFailed', reason: 'EBUSY: resource busy or locked' },
      new DirectoryPath('project').join('src')
    );

    expect(stripVTControlCharacters(String(error.firstCall.args[0]))).to.contain(
      "src' could not be zipped for upload: EBUSY: resource busy or locked"
    );
  });

  describe('a source the build refuses', () => {
    const source = new DirectoryPath('project').join('src');
    const example =
      'Run apimatic quickstart in an empty directory with a sample spec to see an example of a valid portal.';
    let message: sinon.SinonStub;

    const printed = () => message.getCalls().map((call) => stripVTControlCharacters(String(call.args[0])));

    beforeEach(() => {
      sinon.stub(log, 'error');
      message = sinon.stub(log, 'message');
    });

    const describingNoPortal: [string, PortalSourceProblem][] = [
      ['no apimatic.json', { kind: 'missingConfig' }],
      [
        'an apimatic.json with no portal block',
        { kind: 'invalidConfig', errors: ["'portal' is required."], missingPortal: true }
      ]
    ];

    describingNoPortal.forEach(([what, problem]) => {
      it(`points at quickstart's sample portal for ${what}`, () => {
        new PreparePortalProjectPrompts().sourceProblem(problem, source);

        expect(printed()).to.include(example);
      });
    });

    it('does not point at quickstart for a portal block that is there but invalid', () => {
      new PreparePortalProjectPrompts().sourceProblem(
        { kind: 'invalidConfig', errors: ["'portal.site' must be an object."], missingPortal: false },
        source
      );

      expect(printed().join('\n')).to.not.contain('quickstart');
    });
  });
});
