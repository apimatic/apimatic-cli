import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PreparePortalProjectPrompts } from '../../../src/prompts/portal/prepare-project.js';
import { Language } from '../../../src/types/sdk/generate.js';

describe('PreparePortalProjectPrompts', () => {
  afterEach(() => {
    sinon.restore();
  });

  // A run delivers everything or nothing, so a gap is the server's to fix.
  it('names what the artifacts left out, and says to try again', () => {
    const error = sinon.stub(log, 'error');

    new PreparePortalProjectPrompts().artifactsIncomplete({ sdks: [Language.TYPESCRIPT], plugin: true });

    expect(stripVTControlCharacters(String(error.firstCall.args[0]))).to.equal(
      "The portal artifacts did not include the SDK for 'typescript' and the context plugin, which the portal's " +
        "pages need. Try again, and if it keeps happening, reach out to our team at 'support@apimatic.io'."
    );
  });
});
