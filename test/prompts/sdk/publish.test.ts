import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { SdkPublishPrompts } from '../../../src/prompts/sdk/publish.js';

describe('SdkPublishPrompts, about a generation left in conflict', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('says that nothing was published, and when to rerun', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkPublishPrompts().conflictsNotPublished();

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      'Nothing was published, since the SDK still has conflicts. Rerun once they are resolved and staged.'
    );
  });
});
