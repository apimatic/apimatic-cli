import { expect } from 'chai';
import {
  SHARE_HOOK_BLOCK,
  SHARE_HOOK_CALL,
  SHARE_HOOK_SCRIPT,
  SHARE_HOOK_SCRIPT_NAME,
  ShareHook
} from '../../../src/types/sdk/share-hook.js';

describe('ShareHook', () => {
  const installed = (existing: string | undefined): string => {
    const result = ShareHook.installInto(existing);
    expect(result.kind).to.equal('installed');
    return result.kind === 'installed' ? result.content : '';
  };

  it('keeps the script apart from the hook, which only calls it through git', () => {
    expect(SHARE_HOOK_SCRIPT.startsWith('#!/bin/sh\n')).to.be.true;
    expect(SHARE_HOOK_SCRIPT).to.contain('refs/apimatic/pristine');
    expect(SHARE_HOOK_SCRIPT).to.not.contain('pristine/');
    expect(SHARE_HOOK_SCRIPT).to.not.contain('\r');
    expect(SHARE_HOOK_CALL).to.contain(`git rev-parse --git-common-dir)/hooks/${SHARE_HOOK_SCRIPT_NAME}`);
    expect(SHARE_HOOK_CALL.endsWith('|| true')).to.be.true;
    expect(SHARE_HOOK_BLOCK.split('\n')).to.have.length(3);
    expect(SHARE_HOOK_BLOCK).to.contain(SHARE_HOOK_CALL);
  });

  it('is a whole shell hook when there was none', () => {
    const content = installed(undefined);

    expect(content.startsWith('#!/bin/sh\n')).to.be.true;
    expect(content).to.contain(SHARE_HOOK_BLOCK);
    expect(content.endsWith('\n')).to.be.true;
  });

  it('goes right after the shebang of a shell hook that is there, ahead of its own exit', () => {
    const content = installed('#!/usr/bin/env bash\nset -e\necho mine\nexit 0\n');

    expect(content.split('\n')[0]).to.equal('#!/usr/bin/env bash');
    expect(content.indexOf(SHARE_HOOK_BLOCK)).to.be.lessThan(content.indexOf('set -e'));
    expect(content.endsWith('set -e\necho mine\nexit 0\n')).to.be.true;
  });

  it('leaves a hook with no shebang alone, since it may be a binary, unless it runs the script already', () => {
    const result = ShareHook.installInto('echo mine\n');

    expect(result).to.deep.equal({ kind: 'notShell', shebang: '' });
  });

  it('writes LF whatever the hook had, since sh cannot read CRLF', () => {
    const content = installed('#!/bin/sh\r\necho mine\r\n');

    expect(content).to.not.contain('\r');
    expect(content.endsWith('echo mine\n')).to.be.true;
  });

  it('leaves a hook that already holds the current block alone', () => {
    expect(ShareHook.installInto(installed(undefined))).to.deep.equal({ kind: 'present' });
    expect(ShareHook.installInto(installed('#!/bin/sh\necho mine\n'))).to.deep.equal({ kind: 'present' });
  });

  it('refuses a hook in another language, naming its shebang', () => {
    expect(ShareHook.installInto('#!/usr/bin/env node\nconsole.log(1);\n')).to.deep.equal({
      kind: 'notShell',
      shebang: '#!/usr/bin/env node'
    });
    expect(ShareHook.installInto('#!/usr/bin/python3\nprint(1)\n').kind).to.equal('notShell');
  });

  it('accepts the shells git runs hooks with', () => {
    for (const shebang of ['#!/bin/sh', '#!/bin/bash', '#!/usr/bin/env sh', '#!/usr/bin/env bash', '#!/bin/dash']) {
      expect(ShareHook.installInto(`${shebang}\necho mine\n`).kind, shebang).to.equal('installed');
    }
  });

  it('recognises a hook that runs the script by hand, in any language', () => {
    expect(ShareHook.calls(`#!/bin/sh\n${SHARE_HOOK_CALL}\n`)).to.be.true;
    expect(
      ShareHook.calls(
        `#!/usr/bin/env node\nrequire('child_process').execSync('sh .git/hooks/${SHARE_HOOK_SCRIPT_NAME}');\n`
      )
    ).to.be.true;
    expect(ShareHook.calls('#!/bin/sh\necho mine\n')).to.be.false;
    expect(ShareHook.calls(undefined)).to.be.false;
  });
});
