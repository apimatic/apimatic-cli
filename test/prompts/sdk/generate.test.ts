import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
import { GitOperation } from '../../../src/types/git/git-operation.js';
import { RemoteName } from '../../../src/types/git/remote-name.js';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { MergedText } from '../../../src/types/sdk/conflict-markers.js';
import { Conflict, MarkedConflict, MergeFiles, Settlement, WholeConflict } from '../../../src/types/sdk/conflict.js';
import { SHARE_HOOK_CALL, ShareHook } from '../../../src/types/sdk/share-hook.js';
import { SnapshotFetch } from '../../../src/types/sdk/snapshot-fetch.js';
import { WriteProblem } from '../../../src/types/sdk/write-problem.js';
import { Language } from '../../../src/types/sdk/generate.js';
import { NO_FILES, rel } from '../../helpers/merge.js';
import { printed } from '../../helpers/printed.js';

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

  it('says the SDK directory could not be inspected for customizations, in git’s words', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().repositoryNotInspected('git rev-parse failed: bad config');

    expect(stripVTControlCharacters(error.firstCall.args[0])).to.equal(
      'The SDK directory could not be inspected for your customizations: git rev-parse failed: bad config'
    );
  });

  it('gives the steps that keep edits, should the developer make any, when the SDK directory is not a repository', () => {
    const note = printed(() => new SdkGeneratePrompts().gitInitSteps(sdk));

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

  it('says where the recorded snapshot was looked for, and that this generation starts afresh', () => {
    const warn = sinon.stub(log, 'warn');
    const origin = RemoteName.origin();

    new SdkGeneratePrompts().snapshotMissing(sdk, SnapshotFetch.none());
    new SdkGeneratePrompts().snapshotMissing(sdk, SnapshotFetch.absent(origin));
    new SdkGeneratePrompts().snapshotMissing(
      sdk,
      SnapshotFetch.failed(origin, 'the remote did not answer within 30 seconds')
    );

    expect(warn.getCalls().map((call) => stripVTControlCharacters(call.args[0]))).to.deep.equal([
      "The snapshot './sdk/python' was last generated from is not in its repository, and there is no remote to fetch it from, " +
        'so this generation is recorded afresh.',
      "The snapshot './sdk/python' was last generated from is not in its repository, nor on 'origin', " +
        'so this generation is recorded afresh.',
      "The snapshot './sdk/python' was last generated from is not in its repository, and could not be fetched from 'origin': " +
        'the remote did not answer within 30 seconds\nThis generation is recorded afresh.'
    ]);
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

describe('SdkGeneratePrompts, about the hook that shares snapshots', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'python');
  const hooks = sdk.join('.git', 'hooks');
  const file = new FilePath(hooks, new FileName('pre-push'));
  const script = new FilePath(hooks, new FileName('apimatic-pre-push'));

  afterEach(() => {
    sinon.restore();
  });

  it('says it added the hook, naming the file', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().shareHook(ShareHook.written(file, '#!/bin/sh\n'));

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Added a pre-push hook at './sdk/python/.git/hooks/pre-push', so every git push also shares the SDK's snapshots."
    );
  });

  it('names the one line to add where git runs hooks from elsewhere, with a commit step inside the repository and none outside it', () => {
    const husky = new FilePath(sdk.join('.husky'), new FileName('pre-push'));
    const home = new DirectoryPath(process.cwd()).join('home', '.githooks');

    const inside = printed(() =>
      new SdkGeneratePrompts().shareHook(ShareHook.elsewhere(husky, sdk.join('.husky', '_'), script, true))
    );
    const outside = printed(() =>
      new SdkGeneratePrompts().shareHook(
        ShareHook.elsewhere(new FilePath(home, new FileName('pre-push')), home, script, false)
      )
    );

    expect(inside).to.contain('Sharing SDK snapshots needs one step');
    expect(inside).to.contain(
      "git runs hooks from './sdk/python/.husky/_', so the hook the CLI keeps at './sdk/python/.git/hooks/apimatic-pre-push' is not run on push."
    );
    expect(inside).to.contain("1. Add this line to './sdk/python/.husky/pre-push':");
    expect(inside).to.contain(SHARE_HOOK_CALL);
    expect(inside).to.contain('2. Commit it; every clone shares from then on.');
    expect(outside).to.contain("1. Add this line to './home/.githooks/pre-push':");
    expect(outside).to.not.contain('2. Commit');
  });

  it('names a hook in another language it left alone, with the line to add and no commit step', () => {
    const note = printed(() => new SdkGeneratePrompts().shareHook(ShareHook.notShell(file, script)));

    expect(note).to.contain(
      "'./sdk/python/.git/hooks/pre-push' is not a shell script, so the CLI left it alone and the hook it keeps at './sdk/python/.git/hooks/apimatic-pre-push' is not run on push."
    );
    expect(note).to.contain("1. Add this line to './sdk/python/.git/hooks/pre-push':");
    expect(note).to.contain(SHARE_HOOK_CALL);
    expect(note).to.not.contain('2. Commit');
  });

  it('warns when the hook could not be written, and prints nothing for one already calling the script', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().shareHook(ShareHook.notWritten('EACCES: permission denied'));
    const quiet = printed(() => new SdkGeneratePrompts().shareHook(ShareHook.calling()));

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      "The pre-push hook that shares the SDK's snapshots could not be written: EACCES: permission denied"
    );
    expect(quiet).to.equal('');
  });
});

/** A conflict git marked in the file; what the file holds, or which stages it has, does not matter to a prompt. */
const marked = (path: string) => new MarkedConflict(rel(path), 'bothChanged', [], MergedText.parse(new Uint8Array()));
const whole = (path: string, kind: 'deletedByYou' | 'noLongerGenerated' | 'binary') =>
  new WholeConflict(rel(path), kind, [], [], Settlement.untouched(), Settlement.kept(rel(path)));
const files = (overrides: Partial<MergeFiles> = {}): MergeFiles => ({ ...NO_FILES, ...overrides });

describe('SdkGeneratePrompts, about a merge', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'python');

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

    new SdkGeneratePrompts().sdkMerged(sdk, merged, 0);
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

  it('counts the conflicted files in the headline, so it never says nothing changed above a conflict', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().sdkMerged(sdk, files(), 1);
    new SdkGeneratePrompts().sdkMerged(sdk, files({ updated: [rel('README.md')] }), 2);

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Regenerated the SDK at './sdk/python': 1 file in conflict."
    );
    expect(stripVTControlCharacters(info.secondCall.args[0])).to.equal(
      "Regenerated the SDK at './sdk/python': 1 file updated and 2 files in conflict."
    );
  });

  it('says which side each conflict was resolved for, naming the files', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().conflictsResolved(sdk, 'generated', [rel('models/book.py')]);
    new SdkGeneratePrompts().conflictsResolved(sdk, 'yours', [rel('models/book.py'), rel('docs/book.md')]);

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Resolved using the generator's changes:\n  './sdk/python/models/book.py'"
    );
    expect(stripVTControlCharacters(info.secondCall.args[0])).to.equal(
      "Resolved using your changes:\n  './sdk/python/models/book.py'\n  './sdk/python/docs/book.md'"
    );
  });

  it('says that nothing was written when the developer cancels at the question', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().runCancelled(sdk);

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Nothing was written; './sdk/python' is as it was."
    );
  });

  it('warns that the next run will not know about the markers when git could not hold the files as unmerged', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().conflictsNotStaged('index locked');

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      "The conflicted files could not be marked in git's index: index locked\n" +
        'The markers are in the files, but the next run will not know about them: resolve them before rerunning.'
    );
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
    new SdkGeneratePrompts().sdkNotRestored(sdk, 'EACCES on README.md');

    expect(stripVTControlCharacters(error.firstCall.args[0])).to.contain('could not be removed: EBUSY: resource busy');
    const said = stripVTControlCharacters(error.secondCall.args[0]);
    expect(said).to.contain('The files written before it could not be put back either: EACCES on README.md');
    expect(said).to.contain('git -C "./sdk/python" restore --source=refs/apimatic/previous --worktree -- .');
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

describe('SdkGeneratePrompts, about the conflicts', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'python');
  const conflicts: readonly Conflict[] = [marked('models/book.py'), whole('resources/reviews.py', 'noLongerGenerated')];

  afterEach(() => {
    sinon.restore();
  });

  it('lists the conflicted files with what happened to each, and nothing about how it is written', () => {
    const note = printed(() => new SdkGeneratePrompts().conflictsNotAsked(sdk, conflicts));

    expect(note).to.contain('2 files need your attention');
    expect(note).to.contain('book.py').and.to.contain('changed by you and by the generator');
    expect(note).to.contain('reviews.py').and.to.contain('no longer generated');
    expect(note).to.not.contain('markers');
  });

  it('sends a run that could not ask to a terminal, or to --force for the generator’s changes', () => {
    const note = printed(() => new SdkGeneratePrompts().conflictsNotAsked(sdk, conflicts));

    expect(note).to.contain('Nothing was written.');
    expect(note).to.contain('Rerun in a terminal to choose how they are resolved');
    expect(note).to.contain("or with --force to resolve them using the generator's changes.");
  });

  it('speaks of one file in the singular', () => {
    const note = printed(() => new SdkGeneratePrompts().conflictsNotAsked(sdk, [marked('models/book.py')]));

    expect(note).to.contain('1 file needs your attention');
    expect(note).to.contain('to choose how it is resolved');
    expect(note).to.contain("to resolve it using the generator's changes.");
  });

  it('offers a merge tool once git holds the files as unmerged, and names the files with markers and without', () => {
    const note = printed(() =>
      new SdkGeneratePrompts().conflictSteps(sdk, [rel('models/book.py')], [rel('resources/reviews.py')])
    );

    const order = [
      'Next steps',
      "1. Resolve them in a merge tool, such as 'git mergetool' or your editor's merge view, or by hand:",
      'With markers: keep what is right, remove the markers, and stage each file.',
      "'./sdk/python/models/book.py'",
      'Without markers: decide whether each file stays or goes (delete it again, or keep it as your own), and stage that.',
      "'./sdk/python/resources/reviews.py'",
      '2. Rerun the command.'
    ].map((line) => note.indexOf(line));
    expect(order).to.not.include(-1);
    expect(order).to.deep.equal([...order].sort((a, b) => a - b));
  });

  it('leaves the merge tool out when git does not hold the files as unmerged, and the group a plan does not have', () => {
    const note = printed(() => new SdkGeneratePrompts().conflictStepsByHand(sdk, [rel('models/book.py')], []));

    expect(note).to.contain('1. Resolve it by hand:');
    expect(note).to.not.contain('merge tool');
    expect(note).to.not.contain('Without markers');
  });
});

describe('SdkGeneratePrompts, about what the last run left', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'python');
  const paths = [rel('models/book.py'), rel('docs/book.md')];

  afterEach(() => {
    sinon.restore();
  });

  it('refuses a repository in the middle of an operation, naming it and how to abort it', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().operationInProgress(sdk, GitOperation.markedBy('REBASE_HEAD'));

    const said = stripVTControlCharacters(error.firstCall.args[0]);
    expect(said).to.contain("The repository at './sdk/python' is in the middle of a rebase.");
    expect(said).to.contain('git rebase --abort');
  });

  it('lists the files still unresolved and asks for them to be staged, in the singular for one', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().conflictsUnresolved(sdk, paths);
    new SdkGeneratePrompts().conflictsUnresolved(sdk, [paths[0]]);

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      '2 files from the last run are still unresolved. Resolve and stage them, then rerun:\n' +
        "  './sdk/python/models/book.py'\n  './sdk/python/docs/book.md'"
    );
    expect(stripVTControlCharacters(warn.secondCall.args[0])).to.match(
      /^1 file from the last run is still unresolved\. Resolve and stage it, then rerun:\n/
    );
  });

  it('says that nothing was done, and that the files could not be settled, in their own words', () => {
    const info = sinon.stub(log, 'info');
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().resolveLater();
    new SdkGeneratePrompts().conflictsNotSettled('git broke');

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      'Nothing was done. Rerun once the files are resolved and staged.'
    );
    expect(stripVTControlCharacters(error.firstCall.args[0])).to.equal('The conflicts could not be settled: git broke');
  });
});
