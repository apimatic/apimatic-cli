import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { expect } from 'chai';

const commitlint = createRequire(import.meta.url).resolve('@commitlint/cli/cli.js');

// The hook and the PR check run the CLI, so this does too.
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

  it('refuses a breaking-change footer in any case under a header without !', () => {
    const result = lint('fix(sdk): drop the legacy flag\n\nbreaking change: --legacy is removed');

    expect(result.valid).to.equal(false);
    expect(result.report).to.contain('breaking-change-in-header');
  });

  it('refuses a body line the parser reads as a note, such as "* Breaking change: none"', () => {
    const result = lint('fix(sdk): drop the legacy flag\n\n* Breaking change: none');

    expect(result.valid).to.equal(false);
    expect(result.report).to.contain('breaking-change-in-header');
  });
});

describe('.github/commitlint-pull-request.cjs', () => {
  const squash = (title: string, description = '') =>
    lint(`${title}\n\n${description}`, '.github/commitlint-pull-request.cjs');

  it('refuses the titles GitHub writes itself', () => {
    expect(squash('Revert "fix(portal): keep the header on one line"').valid).to.equal(false);
    expect(squash('Merge branch dev into feature').valid).to.equal(false);
  });

  it('accepts a conventional title, breaking or not', () => {
    expect(squash('feat(sdk)!: retire v3 generation').valid).to.equal(true);
    expect(squash('revert(portal): offer the page actions on API reference pages').valid).to.equal(true);
  });

  it('refuses a breaking footer in the description unless the title carries !', () => {
    const result = squash('feat(sdk): retire v3 generation', '**BREAKING CHANGE:** v3 is gone');

    expect(result.valid).to.equal(false);
    expect(result.report).to.contain('breaking-change-in-header');
    expect(squash('feat(sdk)!: retire v3 generation', '**BREAKING CHANGE:** v3 is gone').valid).to.equal(true);
  });

  it('takes a description as written, long lines and field-like lines included', () => {
    const description = `## Summary\n\n${'x'.repeat(150)}\n\n-notes-\nFixes apimatic/apimatic-io#2259`;

    expect(squash('fix(portal): keep the header on one line', description).valid).to.equal(true);
  });
});
