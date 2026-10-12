import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PreparePortalProjectPrompts } from '../../../src/prompts/portal/prepare-project.js';
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
