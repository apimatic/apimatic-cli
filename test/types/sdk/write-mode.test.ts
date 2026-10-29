import { expect } from 'chai';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
import { SdkDestination } from '../../../src/types/sdk/sdk-destination.js';
import { noticeFor, onConflictFor, RunMode, writeModeFor } from '../../../src/types/sdk/write-mode.js';

const repository = 'the repository';
const base = CommitId.fromGit('a'.repeat(40))!;

const ASKING: RunMode = { force: false, interaction: 'ask', gitInit: false };
const SILENT: RunMode = { force: false, interaction: 'never', gitInit: false };
const FORCED: RunMode = { force: true, interaction: 'never', gitInit: false };

const overwrite: SdkDestination<string> = { kind: 'overwrite', found: GitVersion.parse('git version 2.30.2') };
const noRepository: SdkDestination<string> = { kind: 'noRepository' };
const noRecord: SdkDestination<string> = { kind: 'record', repository, because: { kind: 'noRecord' } };
const otherGeneration: SdkDestination<string> = {
  kind: 'record',
  repository,
  because: { kind: 'otherGeneration' }
};
const snapshotMissing: SdkDestination<string> = {
  kind: 'record',
  repository,
  because: { kind: 'snapshotMissing', fetch: { kind: 'noRemote' } }
};
const merge: SdkDestination<string> = { kind: 'merge', repository, base };

describe('noticeFor', () => {
  it('tells the developer what the destination means, when it means something', () => {
    expect(noticeFor(overwrite)).to.deep.equal({ kind: 'gitUnavailable', found: overwrite.found });
    expect(noticeFor(noRecord)).to.be.undefined;
    expect(noticeFor(otherGeneration)).to.be.undefined;
    expect(noticeFor(merge)).to.be.undefined;
  });
});

describe('writeModeFor', () => {
  it('saves over a directory git cannot keep, confirming only when it holds files and --force is off', () => {
    expect(writeModeFor(overwrite, ASKING, false)).to.deep.equal({
      kind: 'save',
      confirmOverwrite: false,
      warnNoRepository: false
    });
    expect(writeModeFor(overwrite, ASKING, true)).to.deep.equal({
      kind: 'save',
      confirmOverwrite: true,
      warnNoRepository: false
    });
    expect(writeModeFor(overwrite, FORCED, true)).to.deep.equal({
      kind: 'save',
      confirmOverwrite: false,
      warnNoRepository: false
    });
  });

  it('makes the directory a repository only with --git-init, and otherwise saves without one, warning, however the run started', () => {
    for (const run of [ASKING, SILENT, FORCED]) {
      expect(writeModeFor(noRepository, { ...run, gitInit: true }, false)).to.deep.equal({
        kind: 'init',
        confirmOverwrite: false
      });
      expect(writeModeFor(noRepository, run, false)).to.deep.equal({
        kind: 'save',
        confirmOverwrite: false,
        warnNoRepository: true
      });
    }
    expect(writeModeFor(noRepository, { ...ASKING, gitInit: true }, true)).to.deep.equal({
      kind: 'init',
      confirmOverwrite: true
    });
  });

  it('records a fresh snapshot, announcing the repository the first time', () => {
    expect(writeModeFor(noRecord, ASKING, true)).to.deep.equal({
      kind: 'record',
      repository,
      confirmOverwrite: true,
      announceRepository: true,
      warnReplacedRecord: false
    });
    expect(writeModeFor(noRecord, FORCED, true)).to.deep.equal({
      kind: 'record',
      repository,
      confirmOverwrite: false,
      announceRepository: true,
      warnReplacedRecord: false
    });
    expect(writeModeFor(otherGeneration, ASKING, true)).to.deep.equal({
      kind: 'record',
      repository,
      confirmOverwrite: true,
      announceRepository: false,
      warnReplacedRecord: false
    });
  });

  it('replaces, under --force, a recorded SDK it cannot merge into, warning instead of asking', () => {
    for (const destination of [otherGeneration, snapshotMissing]) {
      expect(writeModeFor(destination, FORCED, true)).to.deep.equal({
        kind: 'record',
        repository,
        confirmOverwrite: false,
        announceRepository: false,
        warnReplacedRecord: true
      });
    }
  });

  it('refuses before anything else when the overwrite question has no one to answer it', () => {
    expect(writeModeFor(noRecord, SILENT, true)).to.deep.equal({
      kind: 'refuse',
      because: { kind: 'cannotAskToOverwrite' }
    });
    expect(writeModeFor(otherGeneration, SILENT, true)).to.deep.equal({
      kind: 'refuse',
      because: { kind: 'cannotAskToOverwrite' }
    });
    expect(writeModeFor(noRecord, SILENT, false)).to.deep.equal({
      kind: 'record',
      repository,
      confirmOverwrite: false,
      announceRepository: true,
      warnReplacedRecord: false
    });
  });

  it('merges without confirming, meeting conflicts as the run allows: a question, the generator’s side, or a refusal', () => {
    const modes = [ASKING, FORCED, SILENT].map((run) => writeModeFor(merge, run, true));

    expect(modes.map((mode) => mode.kind === 'merge' && mode.onConflict)).to.deep.equal(['ask', 'generated', 'refuse']);
    expect(modes.every((mode) => mode.kind === 'merge' && !mode.confirmOverwrite && mode.base === base)).to.be.true;
  });
});

describe('onConflictFor', () => {
  it('asks in a terminal, takes the generator’s side under --force, and stops any other run', () => {
    expect([ASKING, FORCED, SILENT].map(onConflictFor)).to.deep.equal(['ask', 'generated', 'refuse']);
  });
});
