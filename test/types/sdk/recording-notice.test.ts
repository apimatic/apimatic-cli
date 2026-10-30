import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { recordingNotice } from '../../../src/types/sdk/recording-notice.js';
import { ShareHookInstall } from '../../../src/types/sdk/repository-state.js';

describe('recordingNotice', () => {
  const hooks = new DirectoryPath(process.cwd()).join('.git', 'hooks');
  const file = new FilePath(hooks, new FileName('pre-push'));
  const script = new FilePath(hooks, new FileName('apimatic-pre-push'));

  it('reports the snapshot first, saying whether a fresh write or a merge went unrecorded', () => {
    expect(recordingNotice(err({ step: 'snapshot', reason: 'git broke' }), 'fresh')).to.deep.equal({
      kind: 'snapshotNotRecorded',
      after: 'fresh',
      problem: { reason: 'git broke' }
    });
    expect(recordingNotice(err({ step: 'snapshot', reason: 'git broke' }), 'merge').kind).to.equal(
      'snapshotNotRecorded'
    );
    expect(recordingNotice(err({ step: 'hook', reason: 'EACCES' }), 'fresh')).to.deep.equal({
      kind: 'hookNotInstalled',
      problem: { reason: 'EACCES' }
    });
  });

  it('passes on what the hook still needs, announces a hook it wrote, and says nothing for one already there', () => {
    const needed: ShareHookInstall = {
      kind: 'notShell',
      file,
      shebang: '#!/usr/bin/env node',
      script,
      steps: ['addCall']
    };

    expect(recordingNotice(ok(needed), 'fresh')).to.deep.equal({ kind: 'hookNeedsOneStep', needed });
    expect(recordingNotice(ok({ kind: 'installed', file, written: true }), 'fresh')).to.deep.equal({
      kind: 'hookInstalled',
      file
    });
    expect(recordingNotice(ok({ kind: 'installed', file, written: false }), 'merge')).to.deep.equal({
      kind: 'nothingToSay'
    });
  });
});
