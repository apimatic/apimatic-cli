import { expect } from 'chai';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord, recordContents } from '../../../src/types/sdk/generation-record.js';

const SHA = 'a'.repeat(40);

const json = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ schemaVersion: 1, language: 'typescript', stability: 'stable', pristine: SHA, ...overrides });

describe('GenerationRecord', () => {
  it('reads what a recording wrote, and is a base only for the generation it names', () => {
    const record = GenerationRecord.parse(recordContents(Language.PYTHON, Stability.BETA, CommitId.fromGit(SHA)!));

    expect(record.isFound()).to.be.true;
    expect(record.baseFor(Language.PYTHON, Stability.BETA)?.toString()).to.equal(SHA);
    expect(record.baseFor(Language.PYTHON, Stability.STABLE)).to.be.undefined;
    expect(record.baseFor(Language.TYPESCRIPT, Stability.BETA)).to.be.undefined;
  });

  it('is written with its fields in a fixed order, so a committed record diffs only when something changed', () => {
    expect(recordContents(Language.TYPESCRIPT, Stability.STABLE, CommitId.fromGit(SHA)!)).to.equal(
      [
        '{',
        '  "schemaVersion": 1,',
        '  "language": "typescript",',
        '  "stability": "stable",',
        `  "pristine": "${SHA}"`,
        '}',
        ''
      ].join('\n')
    );
  });

  it('is none for what it cannot read, as for no record at all', () => {
    const unreadable = [
      'not json',
      '[]',
      json({ schemaVersion: 2 }),
      json({ language: 'cobol' }),
      json({ stability: 'alpha' }),
      json({ pristine: 'HEAD' })
    ];
    for (const text of unreadable) {
      expect(GenerationRecord.parse(text).isFound(), text).to.be.false;
      expect(GenerationRecord.parse(text).baseFor(Language.TYPESCRIPT, Stability.STABLE), text).to.be.undefined;
    }
    expect(GenerationRecord.none().isFound()).to.be.false;
    expect(GenerationRecord.none().baseFor(Language.TYPESCRIPT, Stability.STABLE)).to.be.undefined;
  });

  it('reads a record another tool annotated', () => {
    const record = GenerationRecord.parse(json({ generatedAt: 'yesterday', cliVersion: 2 }));

    expect(record.baseFor(Language.TYPESCRIPT, Stability.STABLE)?.toString()).to.equal(SHA);
  });
});
