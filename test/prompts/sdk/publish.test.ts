import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { SdkPublishPrompts } from '../../../src/prompts/sdk/publish.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';

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

describe('SdkPublishPrompts, about a dry run', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('says the directory holds what a real run uploads, and what stays out', () => {
    const info = sinon.stub(log, 'info');

    new SdkPublishPrompts().dryRunNotice(new DirectoryPath(path.join('sdk', 'python')), '\n\n  Profile:   p');

    const said = stripVTControlCharacters(info.firstCall.args[0]);
    expect(said).to.contain(
      'is what a run without --dry-run uploads: the files git would commit, so .git, .apimatic and anything its ' +
        '.gitignore excludes stay out. You can publish it by removing the flag. It will be published for the following:' +
        '\n\n  Profile:   p'
    );
  });
});
