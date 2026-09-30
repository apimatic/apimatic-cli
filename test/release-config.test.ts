import { createRequire } from 'node:module';
import { expect } from 'chai';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';

type Plugin = string | [string, object];

const { plugins } = createRequire(import.meta.url)('../release.config.cjs') as { plugins: Plugin[] };

function optionsOf(name: string): object {
  const plugin = plugins.find((entry): entry is [string, object] => Array.isArray(entry) && entry[0] === name);
  return plugin![1];
}

function contextOf(messages: string[]) {
  return {
    cwd: process.cwd(),
    options: { repositoryUrl: 'https://github.com/apimatic/apimatic-cli.git' },
    lastRelease: { gitTag: 'v2.0.0', version: '2.0.0' },
    nextRelease: { gitTag: 'v2.0.1', version: '2.0.1' },
    commits: messages.map((message, index) => ({ hash: String(index).padStart(40, 'a'), message })),
    logger: { log: () => {}, error: () => {} },
    env: {}
  };
}

const releaseOf = (...messages: string[]) =>
  analyzeCommits(optionsOf('@semantic-release/commit-analyzer'), contextOf(messages));
const notesOf = (...messages: string[]) =>
  generateNotes(optionsOf('@semantic-release/release-notes-generator'), contextOf(messages));

// Lines a PR description really carries, each of which the preset's default parser turns into a note, a field or a reference.
const DESCRIPTION = [
  '## Summary',
  '* Breaking change: none',
  '| Breaking change | No |',
  '-notes-',
  'the notes field, as the default field pattern reads it',
  'Follow-up to #394.',
  'Fixes apimatic/apimatic-io#2259'
].join('\n');

describe('release.config.cjs', () => {
  it('releases and writes the notes from the header alone, whatever the squash body says', async () => {
    const fix = `fix(portal): keep the header on one line (#398)\n\n${DESCRIPTION}`;

    const notes = await notesOf(fix);

    expect(await releaseOf(fix)).to.equal('patch');
    expect(notes).to.contain('keep the header on one line');
    expect(notes).not.to.contain('BREAKING');
    expect(notes).not.to.contain('closes');
  });

  it('makes a major release of a header marked with !', async () => {
    const breaking = `feat(sdk)!: retire v3 generation (#359)\n\n${DESCRIPTION}`;

    const notes = await notesOf(breaking);

    expect(await releaseOf(breaking)).to.equal('major');
    expect(notes).to.contain('BREAKING CHANGES');
    expect(notes).to.contain('retire v3 generation');
  });

  it('releases a patch for a revert header, and a major for a breaking one', async () => {
    expect(await releaseOf('revert(portal): offer the page actions on API reference pages (#397)')).to.equal('patch');
    expect(await releaseOf('revert(portal)!: bring back the v3 generator (#420)')).to.equal('major');
  });

  it('releases nothing for a promotion merge commit or a documentation change', async () => {
    expect(
      await releaseOf(
        'Merge pull request #404 from apimatic/dev\n\nRelease',
        'docs: add the CONTEXT.md glossary (#365)'
      )
    ).to.equal(null);
  });
});
