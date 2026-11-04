import path from 'path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { HookFacts, SHARE_HOOK_CALL, ShareHook } from '../../../src/types/sdk/share-hook.js';
import { hookKind } from '../../helpers/snapshots.js';

describe('ShareHook', () => {
  const repository = new DirectoryPath(process.cwd()).join('sdk', 'python');
  const own = repository.join('.git', 'hooks');
  const file = new FilePath(own, new FileName('pre-push'));
  const script = new FilePath(own, new FileName('apimatic-pre-push'));

  /** The hook git runs from its own hooks directory, as `existing` on disk, unless the facts say otherwise. */
  const found = (existing: string, facts: Partial<HookFacts> = {}) =>
    ShareHook.found({ existing, own, runFrom: own, repository, ...facts });

  /** The content the rule writes into the hook file, which it must. */
  const written = (existing: string): string => {
    const hook = found(existing);
    expect(hookKind(hook)).to.equal(`written ${file}`);
    return hook.toWrite()!;
  };

  it('is a whole shell hook when there was none', () => {
    expect(written('')).to.equal(
      '#!/bin/sh\n\n# >>> apimatic snapshots\n' +
        '# Hands the refs git lists on stdin to the script, then back to the rest of this hook.\n' +
        `${SHARE_HOOK_CALL}\n# <<< apimatic snapshots\n`
    );
    expect(written('\n')).to.equal(written(''));
  });

  it('goes right after the shebang of a shell hook that is there, ahead of its own exit', () => {
    const content = written('#!/usr/bin/env bash\nset -e\necho mine\nexit 0\n');

    expect(content.split('\n')[0]).to.equal('#!/usr/bin/env bash');
    expect(content.indexOf(SHARE_HOOK_CALL)).to.be.lessThan(content.indexOf('set -e'));
    expect(content.endsWith('set -e\necho mine\nexit 0\n')).to.be.true;
    expect(written('#!/bin/sh\necho mine').endsWith('echo mine\n')).to.be.true;
  });

  it('writes LF whatever the hook had, since sh cannot read CRLF', () => {
    const content = written('#!/bin/sh\r\necho mine\r\n');

    expect(content).to.not.contain('\r');
    expect(content.endsWith('echo mine\n')).to.be.true;
  });

  it('accepts the shells git runs hooks with', () => {
    for (const shebang of ['#!/bin/sh', '#!/bin/bash', '#!/usr/bin/env sh', '#!/usr/bin/env bash', '#!/bin/dash']) {
      expect(hookKind(found(`${shebang}\necho mine\n`)), shebang).to.equal(`written ${file}`);
    }
  });

  it('leaves a hook in another language alone, naming the script to call, and one with no shebang, since it may be a binary', () => {
    const left = `notShell ${file} script ${script}`;

    expect(hookKind(found('#!/usr/bin/env node\nconsole.log(1);\n'))).to.equal(left);
    expect(hookKind(found('#!/usr/bin/python3\nprint(1)\n'))).to.equal(left);
    expect(hookKind(found('echo mine\n'))).to.equal(left);
    expect(found('echo mine\n').toWrite()).to.be.undefined;
  });

  it('is calling once the hook runs the script, in any language, and writes nothing', () => {
    const installed = written('');
    const byHand = `#!/usr/bin/env node\nrequire('child_process').execSync('sh .git/hooks/apimatic-pre-push');\n`;

    expect(hookKind(found(installed))).to.equal('calling');
    expect(hookKind(found(written('#!/bin/sh\necho mine\n')))).to.equal('calling');
    expect(hookKind(found(byHand))).to.equal('calling');
    expect(found(installed).toWrite()).to.be.undefined;
  });

  it('writes nothing where git runs hooks from elsewhere, and names the one line to add, committed only inside the repository', () => {
    const husky = repository.join('.husky', '_');
    const huskyFile = new FilePath(repository.join('.husky'), new FileName('pre-push'));
    const home = new DirectoryPath(path.join(process.cwd(), 'home', '.githooks'));

    const elsewhere = found('npm test\n', { runFrom: husky });

    expect(hookKind(elsewhere)).to.equal(`elsewhere ${huskyFile} from ${husky} script ${script} committed`);
    expect(elsewhere.toWrite()).to.be.undefined;
    expect(hookKind(found('', { runFrom: home }))).to.equal(
      `elsewhere ${new FilePath(home, new FileName('pre-push'))} from ${home} script ${script} uncommitted`
    );
    expect(hookKind(found(`npm test\n${SHARE_HOOK_CALL}\n`, { runFrom: husky }))).to.equal('calling');
  });
});
