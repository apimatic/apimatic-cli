import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { MergePlan } from '../../../src/application/sdk-merge/merge-plan.js';
import { SdkWritePrompts } from '../../../src/prompts/sdk/write.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { SdkRepository } from '../../../src/types/sdk/sdk-repository.js';

const plan = (files: Partial<MergePlan['files']>, conflicts: MergePlan['conflicts'] = []) =>
  new MergePlan([], [], conflicts, [], {
    added: [],
    updated: [],
    merged: [],
    removed: [],
    kept: [],
    unchanged: [],
    ...files
  });

describe('SdkWritePrompts.sdkMerged', () => {
  const root = new DirectoryPath(process.cwd());
  const sdk = SdkRepository.create(root, root.join('sdk', 'typescript'))!;

  afterEach(() => {
    sinon.restore();
  });

  it('counts the generator’s files and names yours, relative to where the command ran', () => {
    const info = sinon.stub(log, 'info');

    new SdkWritePrompts().sdkMerged(
      sdk,
      plan({
        added: ['src/models/author.ts'],
        updated: ['README.md', 'src/client.ts'],
        merged: ['src/models/book.ts'],
        kept: ['src/resources/books.ts', 'docs/pricing.md']
      })
    );

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      [
        "Regenerated the SDK at './sdk/typescript': 1 file added and 2 files updated.",
        'Merged with your changes:',
        "  './sdk/typescript/src/models/book.ts'",
        'Kept as you edited:',
        "  './sdk/typescript/src/resources/books.ts'",
        "  './sdk/typescript/docs/pricing.md'"
      ].join('\n')
    );
  });

  it('still names your files when the generator changed nothing, since they are what the next run will merge', () => {
    const info = sinon.stub(log, 'info');

    new SdkWritePrompts().sdkMerged(sdk, plan({ unchanged: ['README.md'], kept: ['src/models/book.ts'] }));

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      [
        "Regenerated the SDK at './sdk/typescript': nothing changed.",
        'Kept as you edited:',
        "  './sdk/typescript/src/models/book.ts'"
      ].join('\n')
    );
  });

  it('counts the conflicted files in the headline, so it never says nothing changed above a conflict', () => {
    const info = sinon.stub(log, 'info');

    new SdkWritePrompts().sdkMerged(sdk, plan({}, [{ path: 'src/resources/authors.ts', kind: 'noLongerGenerated' }]));

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Regenerated the SDK at './sdk/typescript': 1 file in conflict."
    );
  });
});
