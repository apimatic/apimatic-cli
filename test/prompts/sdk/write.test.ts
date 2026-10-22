import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { SdkWritePrompts } from '../../../src/prompts/sdk/write.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { ConflictKind, MergePlan } from '../../../src/types/sdk/merge-plan.js';

const rel = (value: string) => RelativeFilePath.fromGit(value);

const plan = (
  files: Partial<Record<keyof MergePlan['files'], string[]>>,
  conflicts: { path: string; kind: ConflictKind }[] = []
) =>
  new MergePlan(
    [],
    [],
    conflicts.map((conflict) => ({ ...conflict, path: rel(conflict.path) })),
    [],
    {
      added: [],
      updated: [],
      merged: [],
      removed: [],
      kept: [],
      unchanged: [],
      ...Object.fromEntries(Object.entries(files).map(([kind, paths]) => [kind, paths.map(rel)]))
    }
  );

describe('SdkWritePrompts.sdkMerged', () => {
  const root = new DirectoryPath(process.cwd());
  const sdk = root.join('sdk', 'typescript');

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
        'Kept as yours:',
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
        'Kept as yours:',
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
