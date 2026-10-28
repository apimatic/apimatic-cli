import { expect } from 'chai';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { SdkDestination } from '../../../src/types/sdk/sdk-destination.js';
import { creating, noticeFor, RunMode, writeModeFor } from '../../../src/types/sdk/write-mode.js';

const repository = 'the repository';
const base = CommitId.fromGit('a'.repeat(40))!;
const recorded = { language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.BETA };

const ASKING: RunMode = { force: false, interaction: 'ask' };
const SILENT: RunMode = { force: false, interaction: 'never' };
const FORCED: RunMode = { force: true, interaction: 'never' };

const overwrite: SdkDestination<string> = { kind: 'overwrite', found: GitVersion.parse('git version 2.30.2') };
const noRepository: SdkDestination<string> = { kind: 'noRepository' };
const noRecord: SdkDestination<string> = { kind: 'record', repository, because: { kind: 'noRecord' } };
const otherGeneration: SdkDestination<string> = {
  kind: 'record',
  repository,
  because: { kind: 'otherGeneration', recorded }
};
const merge: SdkDestination<string> = { kind: 'merge', repository, base };

describe('noticeFor', () => {
  it('tells the developer what the destination means, when it means something', () => {
    expect(noticeFor(overwrite)).to.deep.equal({ kind: 'gitUnavailable', found: overwrite.found });
    expect(noticeFor(otherGeneration)).to.deep.equal({ kind: 'otherGeneration', recorded });
    expect(noticeFor(noRecord)).to.be.undefined;
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

  it('asks whether to create a repository, saves without one under --force, and refuses when it cannot ask', () => {
    expect(writeModeFor(noRepository, ASKING, false)).to.deep.equal({ kind: 'askToCreate', confirmOverwrite: false });
    expect(writeModeFor(noRepository, FORCED, true)).to.deep.equal({
      kind: 'save',
      confirmOverwrite: false,
      warnNoRepository: true
    });
    expect(writeModeFor(noRepository, SILENT, false)).to.deep.equal({
      kind: 'refuse',
      because: { kind: 'cannotAsk', question: 'createRepository' }
    });
  });

  it('records a fresh snapshot, but refuses --force over a record it cannot merge against', () => {
    expect(writeModeFor(noRecord, ASKING, true)).to.deep.equal({ kind: 'record', repository, confirmOverwrite: true });
    expect(writeModeFor(noRecord, FORCED, true)).to.deep.equal({ kind: 'record', repository, confirmOverwrite: false });
    expect(writeModeFor(otherGeneration, FORCED, true)).to.deep.equal({
      kind: 'refuse',
      because: { kind: 'recordedNotReplaced' }
    });
  });

  it('refuses before anything else when the overwrite question has no one to answer it', () => {
    expect(writeModeFor(noRecord, SILENT, true)).to.deep.equal({
      kind: 'refuse',
      because: { kind: 'cannotAsk', question: 'overwrite' }
    });
    expect(writeModeFor(noRecord, SILENT, false)).to.deep.equal({
      kind: 'record',
      repository,
      confirmOverwrite: false
    });
  });

  it('merges without confirming, meeting conflicts as the run allows: a question, markers, or a refusal', () => {
    const modes = [ASKING, FORCED, SILENT].map((run) => writeModeFor(merge, run, true));

    expect(modes.map((mode) => mode.kind === 'merge' && mode.onConflict)).to.deep.equal(['ask', 'markers', 'refuse']);
    expect(modes.every((mode) => mode.kind === 'merge' && !mode.confirmOverwrite && mode.base === base)).to.be.true;
  });
});

describe('creating', () => {
  it('initialises a repository on yes, and saves without one on no', () => {
    expect(creating(true)).to.deep.equal({ kind: 'init', confirmOverwrite: false });
    expect(creating(false)).to.deep.equal({ kind: 'save', confirmOverwrite: false, warnNoRepository: true });
  });
});
