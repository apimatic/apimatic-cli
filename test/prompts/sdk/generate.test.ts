import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { Language } from '../../../src/types/sdk/generate.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { ConflictKind, MergePlan } from '../../../src/types/sdk/merge-plan.js';
import { RemoteName } from '../../../src/types/git/remote-name.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { SnapshotRef } from '../../../src/types/sdk/snapshot-ref.js';

describe('SdkGeneratePrompts.languageNotAvailable', () => {
  const prompts = new SdkGeneratePrompts();
  let error: sinon.SinonStub;

  beforeEach(() => {
    error = sinon.stub(log, 'error');
  });

  afterEach(() => {
    error.restore();
  });

  const messageFor = (language: Language): string => {
    prompts.languageNotAvailable(language);
    return error.firstCall.args[0] as string;
  };

  // The language the user asked for, under the name the rest of the CLI shows it by — not the
  // flag value they typed, which is how every other list in this CLI would render it.
  it('names the language that was asked for', () => {
    expect(messageFor(Language.RUBY)).to.contain("Ruby isn't available yet.");
  });

  it('lists the three that can be generated now', () => {
    const message = messageFor(Language.JAVA);

    expect(message).to.contain('Available now: C#, TypeScript, Python');
  });

  // Naming them is the difference between "not yet" and "not ever", and the four that left with
  // v3 are coming back.
  it('lists the four that are coming soon', () => {
    const message = messageFor(Language.GO);

    expect(message).to.contain('Coming soon: Java, Ruby, Go, PHP');
  });

  // There is no version to fall back to any more, so nothing may suggest one.
  it('offers no code generator to fall back to', () => {
    const message = messageFor(Language.PHP);

    expect(message).to.not.contain('v3');
    expect(message).to.not.contain('codegen-version');
  });
});

describe('SdkGeneratePrompts.sdkNotUnzipped', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('says what a bad response says, then why the SDK could not be unzipped', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().sdkNotUnzipped({ kind: 'unzipFailed', reason: 'Invalid or unsupported zip format' });

    expect(error.firstCall.args[0]).to.equal(
      `${ServiceError.InvalidResponse.errorMessage}\nInvalid or unsupported zip format`
    );
  });
});

const rel = (value: string) => RelativeFilePath.fromGit(value)!;

const plan = (
  files: Partial<Record<keyof MergePlan['files'], string[]>>,
  conflicts: { path: string; kind: ConflictKind }[] = []
) =>
  new MergePlan(
    [],
    [],
    conflicts.map((conflict) => ({ ...conflict, path: rel(conflict.path) })),
    {
      added: [],
      updated: [],
      merged: [],
      removed: [],
      kept: [],
      ...Object.fromEntries(Object.entries(files).map(([kind, paths]) => [kind, paths.map(rel)]))
    }
  );

describe('SdkGeneratePrompts.sdkMerged', () => {
  const root = new DirectoryPath(process.cwd());
  const sdk = root.join('sdk', 'typescript');

  afterEach(() => {
    sinon.restore();
  });

  it('counts the generator’s files and names yours, relative to where the command ran', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().sdkMerged(
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
        "Regenerated the SDK at './sdk/typescript': 1 file added, 2 files updated and 1 file merged.",
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

    new SdkGeneratePrompts().sdkMerged(sdk, plan({ kept: ['src/models/book.ts'] }));

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      [
        "Regenerated the SDK at './sdk/typescript': nothing changed.",
        'Kept as yours:',
        "  './sdk/typescript/src/models/book.ts'"
      ].join('\n')
    );
  });

  it('counts a merged file in the headline, so it never says nothing changed above one', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().sdkMerged(sdk, plan({ merged: ['src/models/book.ts'] }));

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      [
        "Regenerated the SDK at './sdk/typescript': 1 file merged.",
        'Merged with your changes:',
        "  './sdk/typescript/src/models/book.ts'"
      ].join('\n')
    );
  });

  it('counts the conflicted files in the headline, so it never says nothing changed above a conflict', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().sdkMerged(
      sdk,
      plan({}, [{ path: 'src/resources/authors.ts', kind: 'noLongerGenerated' }])
    );

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Regenerated the SDK at './sdk/typescript': 1 file in conflict."
    );
  });
});

describe('SdkGeneratePrompts, about the conflicts', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'typescript');
  const conflicted = plan({}, [
    { path: 'src/models/book.ts', kind: 'bothChanged' },
    { path: 'src/resources/reviews.ts', kind: 'noLongerGenerated' }
  ]);

  /** Boxed or not depending on the terminal's width, but each line stays a line of its own. */
  const printed = (say: (prompts: SdkGeneratePrompts) => void) => {
    const write = sinon.stub(process.stdout, 'write').returns(true);
    try {
      say(new SdkGeneratePrompts());
    } finally {
      write.restore();
    }
    return stripVTControlCharacters(write.args.map(([chunk]) => String(chunk)).join(''));
  };

  it('labels each conflicted file by what happened to it, and nothing about how it is written', () => {
    const note = printed((prompts) => prompts.conflictsNotAsked(conflicted, sdk));

    expect(note).to.contain('changed by you and by the generator');
    expect(note).to.contain('no longer generated');
    expect(note).to.not.contain(';');
  });

  it('sends a run that could not ask to a terminal, or to --force for the generator’s changes', () => {
    expect(printed((prompts) => prompts.conflictsNotAsked(conflicted, sdk))).to.contain(
      "or with --force to resolve them using the generator's changes."
    );
  });

  it('offers a merge tool once git holds the files as unmerged, and names the files with markers and without', () => {
    const note = printed((prompts) => prompts.conflictSteps(conflicted, sdk, true));

    const order = [
      "1. Resolve them in a merge tool, such as 'git mergetool' or your editor's merge view, or by hand:",
      'With markers: keep what is right, remove the markers, and stage each file.',
      "'./sdk/typescript/src/models/book.ts'",
      'Without markers: decide whether each file stays or goes',
      "'./sdk/typescript/src/resources/reviews.ts'",
      '2. Rerun the command; nothing needs committing first.',
      '3. Or rerun and let the CLI resolve what is left, using either side.'
    ].map((line) => note.indexOf(line));
    expect(order.every((at, index) => at >= 0 && (index === 0 || at > order[index - 1]))).to.be.true;
  });

  it('leaves the merge tool out when git does not hold the files as unmerged, and the group a plan does not have', () => {
    const note = printed((prompts) =>
      prompts.conflictSteps(plan({}, [{ path: 'src/models/book.ts', kind: 'bothChanged' }]), sdk, false)
    );

    expect(note).to.contain('1. Resolve it by hand:');
    expect(note).to.not.contain('merge tool');
    expect(note).to.not.contain('Without markers');
  });
});

describe('SdkGeneratePrompts, about the repository', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'python');

  afterEach(() => {
    sinon.restore();
  });

  it('names the flag that makes the SDK directory a repository when it is not one', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().repositoryNotCreated(sdk);

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      "'./sdk/python' is not a git repository of its own, so your customizations to the generated SDK " +
        'will not persist across regenerations. Run with --git-init to make it one.'
    );
  });

  it('says which repository keeps the customizations when the developer already had one', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().repositoryFound(sdk);

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Found a git repository in './sdk/python', which keeps your customizations across regenerations."
    );
  });
});

describe('SdkGeneratePrompts.snapshotNotRecorded', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('says what the next run does without the record: replace, or merge against the one before', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().snapshotNotRecorded({ reason: 'git broke' });
    new SdkGeneratePrompts().snapshotNotRecordedAfterMerge({ reason: 'git broke' });

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      'The SDK was written, but its snapshot could not be recorded: git broke\n' +
        'The next run will replace the SDK instead of merging your customizations into it.'
    );
    expect(stripVTControlCharacters(warn.secondCall.args[0])).to.equal(
      'The SDK was written, but its snapshot could not be recorded: git broke\n' +
        "The next run will merge against the snapshot recorded before this one, and list this run's generated changes as yours."
    );
  });
});

describe('SdkGeneratePrompts.snapshotMissing', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('says where the snapshot was looked for: no remote, the remote too, or a remote that failed', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().snapshotMissing({ kind: 'noRemote' });
    new SdkGeneratePrompts().snapshotMissing({ kind: 'absent', remote: RemoteName.origin() });
    new SdkGeneratePrompts().snapshotMissing({ kind: 'failed', remote: RemoteName.origin(), reason: 'could not read' });

    const said = warn.getCalls().map((call) => stripVTControlCharacters(call.args[0]));
    expect(said[0]).to.contain('not available here, and there is no remote to fetch it from');
    expect(said[1]).to.contain('not available here or on');
    expect(said[1]).to.contain('origin');
    expect(said[2]).to.contain('could not be fetched from');
    expect(said[2]).to.contain('could not read');
    expect(said.every((line) => line.endsWith('so the new SDK cannot be merged into it.'))).to.be.true;
  });
});

describe('SdkGeneratePrompts.sdkNotWritten', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'python');

  afterEach(() => {
    sinon.restore();
  });

  it('names the command that puts the directory back from its own repository when the undo failed too', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().sdkNotWritten(sdk, {
      kind: 'notApplied',
      file: new FilePath(sdk, new FileName('book.py')),
      operation: 'write',
      reason: 'EACCES: permission denied',
      undo: { kind: 'failed', reason: 'EBUSY: resource busy', previous: SnapshotRef.previous() }
    });

    const said = stripVTControlCharacters(error.firstCall.args[0]);
    expect(said).to.contain("'./sdk/python/book.py' could not be written: EACCES: permission denied");
    expect(said).to.contain("  git -C './sdk/python' restore --source=refs/apimatic/previous --worktree -- .");
  });
});

describe('SdkGeneratePrompts.directoryNotInspected', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('words each problem by its kind: an operation in progress, or git itself', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().directoryNotInspected({
      kind: 'operationInProgress',
      operation: 'rebase',
      root: new DirectoryPath(process.cwd())
    });
    new SdkGeneratePrompts().directoryNotInspected({ reason: 'git rev-parse failed: bad config' });

    const said = error.getCalls().map((call) => stripVTControlCharacters(call.args[0]));
    expect(said[0]).to.contain('in the middle of a rebase');
    expect(said[0]).to.contain('git rebase --abort');
    expect(said[1]).to.contain('git rev-parse failed: bad config');
  });
});
