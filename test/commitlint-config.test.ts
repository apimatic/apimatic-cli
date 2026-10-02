import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { expect } from 'chai';

const commitlint = createRequire(import.meta.url).resolve('@commitlint/cli/cli.js');

// The hook and the PR-title check run the CLI, so this does too.
function lint(message: string, config?: string) {
  const args = config ? [commitlint, '--config', config] : [commitlint];
  const result = spawnSync(process.execPath, args, { input: message, encoding: 'utf8' });
  return { valid: result.status === 0, report: result.stdout + result.stderr };
}

describe('commitlint.config.cjs', () => {
  it('refuses a BREAKING CHANGE footer under a header without !', () => {
    const result = lint('fix(sdk): drop the legacy flag\n\nBREAKING CHANGE: --legacy is removed');

    expect(result.valid).to.equal(false);
    expect(result.report).to.contain('breaking-change-in-header');
  });

  it('accepts the footer once the header carries !', () => {
    expect(lint('feat(sdk)!: drop the legacy flag\n\nBREAKING CHANGE: --legacy is removed').valid).to.equal(true);
  });

  it('ignores a body line that only mentions breaking changes', () => {
    expect(lint('fix(sdk): drop the legacy flag\n\n* Breaking change: none').valid).to.equal(true);
  });
});

describe('.github/commitlint-pr-title.cjs', () => {
  const title = (message: string) => lint(message, '.github/commitlint-pr-title.cjs');

  it('refuses the titles GitHub writes itself', () => {
    expect(title('Revert "fix(portal): keep the header on one line"').valid).to.equal(false);
    expect(title('Merge branch dev into feature').valid).to.equal(false);
  });

  it('accepts a conventional title, breaking or not', () => {
    expect(title('feat(sdk)!: retire v3 generation').valid).to.equal(true);
    expect(title('revert(portal): offer the page actions on API reference pages').valid).to.equal(true);
  });
});
