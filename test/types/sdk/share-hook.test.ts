import { expect } from 'chai';
import {
  hookCallsScript,
  hookFileIn,
  planShareHook,
  SHARE_HOOK_CALL,
  SHARE_HOOK_SCRIPT,
  SHARE_HOOK_SCRIPT_NAME,
  ShareHookFacts
} from '../../../src/actions/sdk/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';

describe('the share hook', () => {
  const hooks = new DirectoryPath(process.cwd()).join('.git', 'hooks');
  const file = new FilePath(hooks, new FileName('pre-push'));
  const script = new FilePath(hooks, new FileName(SHARE_HOOK_SCRIPT_NAME));

  /** The hook git runs from its own hooks directory, as found on disk. */
  const own = (existing: string | undefined): ShareHookFacts => ({
    file,
    existing,
    script,
    runFromElsewhere: undefined,
    inRepository: true
  });

  /** The content the plan writes for the hook file, which it must. */
  const installed = (existing: string | undefined): string => {
    const plan = planShareHook(own(existing));
    expect(plan.outcome).to.deep.equal({ kind: 'installed', file, written: true });
    return plan.content ?? '';
  };

  it('keeps the script apart from the hook, which only calls it through git', () => {
    expect(SHARE_HOOK_SCRIPT.startsWith('#!/bin/sh\n')).to.be.true;
    expect(SHARE_HOOK_SCRIPT).to.contain('refs/apimatic/pristine');
    expect(SHARE_HOOK_SCRIPT).to.not.contain('pristine/');
    expect(SHARE_HOOK_SCRIPT).to.not.contain('\r');
    expect(SHARE_HOOK_CALL).to.contain(`git rev-parse --git-common-dir)/hooks/${SHARE_HOOK_SCRIPT_NAME}`);
    expect(SHARE_HOOK_CALL.endsWith('|| true')).to.be.true;
  });

  it('is a whole shell hook when there was none', () => {
    const content = installed(undefined);

    expect(content.startsWith('#!/bin/sh\n')).to.be.true;
    expect(content).to.equal(`#!/bin/sh\n\n# >>> apimatic snapshots\n${SHARE_HOOK_CALL}\n# <<< apimatic snapshots\n`);
    expect(content.endsWith('\n')).to.be.true;
  });

  it('goes right after the shebang of a shell hook that is there, ahead of its own exit', () => {
    const content = installed('#!/usr/bin/env bash\nset -e\necho mine\nexit 0\n');

    expect(content.split('\n')[0]).to.equal('#!/usr/bin/env bash');
    expect(content.indexOf(SHARE_HOOK_CALL)).to.be.lessThan(content.indexOf('set -e'));
    expect(content.endsWith('set -e\necho mine\nexit 0\n')).to.be.true;
  });

  it('leaves a hook with no shebang alone, since it may be a binary, unless it runs the script already', () => {
    const plan = planShareHook(own('echo mine\n'));

    expect(plan.content).to.be.undefined;
    expect(plan.outcome).to.deep.equal({ kind: 'notShell', file, shebang: '', script, steps: ['addCall'] });
  });

  it('writes LF whatever the hook had, since sh cannot read CRLF', () => {
    const content = installed('#!/bin/sh\r\necho mine\r\n');

    expect(content).to.not.contain('\r');
    expect(content.endsWith('echo mine\n')).to.be.true;
  });

  it('leaves a hook that already holds the current block alone', () => {
    const unchanged = { content: undefined, outcome: { kind: 'installed', file, written: false } };

    expect(planShareHook(own(installed(undefined)))).to.deep.equal(unchanged);
    expect(planShareHook(own(installed('#!/bin/sh\necho mine\n')))).to.deep.equal(unchanged);
  });

  it('refuses a hook in another language, naming its shebang', () => {
    expect(planShareHook(own('#!/usr/bin/env node\nconsole.log(1);\n')).outcome).to.deep.equal({
      kind: 'notShell',
      file,
      shebang: '#!/usr/bin/env node',
      script,
      steps: ['addCall']
    });
    expect(planShareHook(own('#!/usr/bin/python3\nprint(1)\n')).outcome.kind).to.equal('notShell');
  });

  it('accepts the shells git runs hooks with', () => {
    for (const shebang of ['#!/bin/sh', '#!/bin/bash', '#!/usr/bin/env sh', '#!/usr/bin/env bash', '#!/bin/dash']) {
      expect(planShareHook(own(`${shebang}\necho mine\n`)).content, shebang).to.not.be.undefined;
    }
  });

  it('writes nothing where git runs hooks from elsewhere, and names the one line to add, with a commit step only inside the repository', () => {
    const runFrom = new DirectoryPath(process.cwd()).join('.husky', '_');
    const elsewhere = { ...own('npm test\n'), runFromElsewhere: runFrom };

    expect(planShareHook(elsewhere)).to.deep.equal({
      content: undefined,
      outcome: { kind: 'elsewhere', file, runFrom, script, steps: ['addCall', 'commit'] }
    });
    expect(planShareHook({ ...elsewhere, inRepository: false }).outcome).to.deep.include({ steps: ['addCall'] });
    expect(planShareHook({ ...elsewhere, existing: `npm test\n${SHARE_HOOK_CALL}\n` }).outcome).to.deep.equal({
      kind: 'installed',
      file,
      written: false
    });
  });

  it('names the pre-push file beside husky’s runners, and inside any other hooks directory', () => {
    const husky = new DirectoryPath(process.cwd()).join('.husky', '_');

    expect(hookFileIn(husky).isEqual(new FilePath(husky.join('..'), new FileName('pre-push')))).to.be.true;
    expect(hookFileIn(hooks).isEqual(file)).to.be.true;
  });

  it('recognises a hook that runs the script by hand, in any language', () => {
    expect(hookCallsScript(`#!/bin/sh\n${SHARE_HOOK_CALL}\n`)).to.be.true;
    expect(
      hookCallsScript(
        `#!/usr/bin/env node\nrequire('child_process').execSync('sh .git/hooks/${SHARE_HOOK_SCRIPT_NAME}');\n`
      )
    ).to.be.true;
    expect(hookCallsScript('#!/bin/sh\necho mine\n')).to.be.false;
    expect(hookCallsScript(undefined)).to.be.false;
  });
});
