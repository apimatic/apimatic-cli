import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { Conflict, MergeFiles } from '../../../src/types/sdk/merge-plan.js';
import { WriteProblem } from '../../../src/types/sdk/write-problem.js';
import { Language } from '../../../src/types/sdk/generate.js';

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

describe('SdkGeneratePrompts, about the destination', () => {
  const root = new DirectoryPath(process.cwd());

  afterEach(() => {
    sinon.restore();
  });

  it('refuses a destination holding the source, and suggests one outside it', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().destinationContainsSource(root.join('src'), root);

    const said = stripVTControlCharacters(error.firstCall.args[0]);
    expect(said).to.contain('contains your source directory');
    expect(said).to.contain('--destination=./sdk');
  });

  it('sends a run that cannot ask about overwriting to a terminal, or to --force', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().cannotAskToOverwrite(root.join('sdk', 'python'));

    const said = stripVTControlCharacters(error.firstCall.args[0]);
    expect(said).to.contain('cannot ask whether to overwrite it');
    expect(said).to.contain('Rerun in a terminal to be asked, or with --force to overwrite.');
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

describe('SdkGeneratePrompts, about git', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('warns what not having git costs, and what a git too old does, naming the version found', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().gitUnavailable();
    new SdkGeneratePrompts().gitVersionNotSupported(GitVersion.parse('git version 2.30.2'));

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      'git is not available, so your customizations to the generated SDK will not persist across regenerations.'
    );
    expect(stripVTControlCharacters(warn.secondCall.args[0])).to.equal(
      'git 2.30.2 was found, but 2.38 or newer is needed, ' +
        'so your customizations to the generated SDK will not persist across regenerations.'
    );
  });
});

describe('SdkGeneratePrompts, about the repository', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'python');

  afterEach(() => {
    sinon.restore();
  });

  it('says which repository could not be inspected, in git’s words', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().repositoryNotInspected(sdk, 'git rev-parse failed: bad config');

    expect(stripVTControlCharacters(error.firstCall.args[0])).to.equal(
      "The git repository in './sdk/python' could not be inspected: git rev-parse failed: bad config"
    );
  });

  it('gives the steps that keep edits, should the developer make any, when the SDK directory is not a repository', () => {
    const write = sinon.stub(process.stdout, 'write').returns(true);
    try {
      new SdkGeneratePrompts().gitInitSteps(sdk);
    } finally {
      write.restore();
    }
    const note = stripVTControlCharacters(write.args.map(([chunk]) => String(chunk)).join(''));

    const order = [
      'Next steps',
      "To customize './sdk/python' and keep your changes when it is regenerated:",
      '1. Rerun with --git-init before you change anything.' +
        ' It makes the folder a git repository of its own, and needs git 2.38 or newer.',
      '2. Then make your changes; each later run merges them into the new generation.'
    ];
    const at = order.map((text) => note.indexOf(text));
    expect(at).to.not.include(-1);
    expect(at).to.deep.equal([...at].sort((a, b) => a - b));
  });

  it('says a repository was initialised, or found, naming the SDK directory', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().repositoryInitialised(sdk);
    new SdkGeneratePrompts().repositoryFound(sdk);

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Initialised a git repository in './sdk/python', which keeps your customizations across regenerations."
    );
    expect(stripVTControlCharacters(info.secondCall.args[0])).to.equal(
      "Found a git repository in './sdk/python', which keeps your customizations across regenerations."
    );
  });

  it('says that nothing was written when the repository could not be made', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().repositoryNotInitialised(sdk, 'git broke');

    expect(stripVTControlCharacters(error.firstCall.args[0])).to.equal(
      "A git repository could not be created in './sdk/python', where the SDK's snapshots would be kept: git broke\n" +
        'Nothing was written.'
    );
  });

  it('says the recorded snapshot is missing, and that this generation starts afresh', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().snapshotMissing(sdk);

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      "The snapshot './sdk/python' was last generated from is not in its repository, so this generation is recorded afresh."
    );
  });

  it('says what the next run does without the snapshot: replace the SDK', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().snapshotNotRecorded('git broke');

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      'The SDK was written, but its snapshot could not be recorded: git broke\n' +
        'The next run will replace the SDK instead of merging your customizations into it.'
    );
  });
});

describe('SdkGeneratePrompts, about a merge', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'python');
  const rel = (value: string) => RelativeFilePath.fromGit(value)!;
  const files = (overrides: Partial<MergeFiles> = {}): MergeFiles => ({
    added: [],
    updated: [],
    merged: [],
    removed: [],
    kept: [],
    ...overrides
  });

  afterEach(() => {
    sinon.restore();
  });

  it('sums up what the generator did and names the files of yours it merged into or left alone, or says nothing changed', () => {
    const info = sinon.stub(log, 'info');
    const merged = files({
      added: [rel('models/author.py')],
      updated: [rel('README.md'), rel('x.py')],
      merged: [rel('models/book.py')],
      kept: [rel('notes.txt')]
    });

    new SdkGeneratePrompts().sdkMerged(sdk, merged);
    new SdkGeneratePrompts().sdkUnchanged(sdk);

    const said = stripVTControlCharacters(info.firstCall.args[0]);
    expect(said).to.match(
      /^Regenerated the SDK at '\.\/sdk\/python': 1 file added, 2 files updated,? and 1 file merged\.\n/
    );
    expect(said).to.contain('Merged with your changes:\n').and.to.contain('book.py');
    expect(said).to.contain('Kept as yours:\n').and.to.contain('notes.txt');
    expect(said).to.not.contain('README.md');
    expect(stripVTControlCharacters(info.secondCall.args[0])).to.equal(
      "Regenerated the SDK at './sdk/python': nothing changed."
    );
  });

  it('lists the conflicts with what each one is, and that nothing was written', () => {
    const write = sinon.stub(process.stdout, 'write').returns(true);
    const conflicts: Conflict[] = [
      { path: rel('models/book.py'), kind: 'bothChanged' },
      { path: rel('docs/book.md'), kind: 'deletedByYou' }
    ];
    try {
      new SdkGeneratePrompts().conflictsNotAsked(sdk, conflicts);
    } finally {
      write.restore();
    }
    const note = stripVTControlCharacters(write.args.map(([chunk]) => String(chunk)).join(''));

    expect(note).to.contain('Conflicts in 2 files');
    expect(note).to.contain('book.py').and.to.contain('changed by you and by the generator');
    expect(note).to.contain('book.md').and.to.contain('deleted by you, changed by the generator');
    expect(note).to.contain('Nothing was written.');
  });

  it('says why a forced run replaced a recorded SDK, and where the committed customizations still are', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().recordedSdkReplaced(sdk);

    const said = stripVTControlCharacters(warn.firstCall.args[0]);
    expect(said).to.contain("The new SDK could not be merged into './sdk/python', so --force replaced it");
    expect(said).to.contain('git -C "./sdk/python" diff');
  });

  it('says that nothing was written when git could not work out the merge', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().customCodeFailed('git broke');

    expect(stripVTControlCharacters(error.firstCall.args[0])).to.equal(
      'Your customizations could not be merged into the regenerated SDK: git broke\nNothing was written.'
    );
  });

  it('names the file a merge could not write, and says when the directory is back as it was', () => {
    const error = sinon.stub(log, 'error');
    const info = sinon.stub(log, 'info');
    const problem: WriteProblem = {
      file: rel('models/book.py'),
      operation: 'write',
      reason: 'EACCES: permission denied'
    };

    new SdkGeneratePrompts().sdkNotWritten(sdk, problem);
    new SdkGeneratePrompts().sdkRestored(sdk);

    expect(stripVTControlCharacters(error.firstCall.args[0])).to.match(
      /^'.*book\.py' could not be written: EACCES: permission denied$/
    );
    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Nothing else was changed; './sdk/python' is as it was."
    );
  });

  it('gives the restore command, from the kept snapshot, when the directory could not be put back', () => {
    const error = sinon.stub(log, 'error');
    const problem: WriteProblem = { file: rel('models/book.py'), operation: 'remove', reason: 'EBUSY: resource busy' };

    new SdkGeneratePrompts().sdkNotWritten(sdk, problem);
    new SdkGeneratePrompts().sdkNotRestored(sdk, CommitId.fromGit('a'.repeat(40))!, 'EACCES on README.md');

    expect(stripVTControlCharacters(error.firstCall.args[0])).to.contain('could not be removed: EBUSY: resource busy');
    const said = stripVTControlCharacters(error.secondCall.args[0]);
    expect(said).to.contain('The files written before it could not be put back either: EACCES on README.md');
    expect(said).to.contain(`git -C "./sdk/python" restore --source=${'a'.repeat(40)} --worktree -- .`);
  });

  it('says what the next run does when the snapshot of a merge is not recorded: merge against the previous one', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().snapshotNotRecordedAfterMerge('git broke');

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      'The SDK was merged, but the new snapshot could not be recorded: git broke\n' +
        'The next run will merge against the previous one.'
    );
  });
});
