import { expect } from 'chai';
import { CommitId } from '../../../src/types/git/commit-id.js';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { GenerationRecord } from '../../../src/types/sdk/generation-record.js';

const SHA = 'a'.repeat(40);

const json = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    language: 'typescript',
    codegenVersion: 'v4',
    stability: 'stable',
    pristine: SHA,
    generatedAt: '2026-10-20T10:00:00.000Z',
    cliVersion: '2.3.0',
    ...overrides
  });

describe('GenerationRecord', () => {
  it('round-trips through its file form', () => {
    const record = GenerationRecord.written(
      { language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.BETA },
      CommitId.create(SHA)!,
      new Date('2026-10-20T10:00:00Z'),
      '2.3.0'
    );

    const parsed = GenerationRecord.parse(record.toJson())!;

    expect(parsed.toJson()).to.equal(record.toJson());
    expect(
      parsed.isFor({ language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.BETA })
    ).to.be.true;
    expect(
      parsed.isFor({ language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.STABLE })
    ).to.be.false;
  });

  it('writes its fields in a fixed order, so a committed record diffs only when something changed', () => {
    const record = GenerationRecord.parse(json())!;

    expect(record.toJson()).to.equal(
      [
        '{',
        '  "schemaVersion": 1,',
        '  "language": "typescript",',
        '  "codegenVersion": "v4",',
        '  "stability": "stable",',
        `  "pristine": "${SHA}",`,
        '  "generatedAt": "2026-10-20T10:00:00.000Z",',
        '  "cliVersion": "2.3.0"',
        '}',
        ''
      ].join('\n')
    );
  });

  it('remembers a pending pull request, with or without a remote, until told to forget it', () => {
    const written = GenerationRecord.parse(json())!;
    const pending = { yours: 'apimatic/conflict/1', generated: 'apimatic/generated/1', remote: 'origin' };

    const awaiting = GenerationRecord.parse(written.awaiting(pending).toJson())!;
    const local = GenerationRecord.parse(written.awaiting({ ...pending, remote: undefined }).toJson())!;

    expect(written.pendingPullRequest()).to.be.undefined;
    expect(awaiting.pendingPullRequest()).to.deep.equal(pending);
    expect(local.pendingPullRequest()).to.deep.equal({ ...pending, remote: undefined });
    expect(awaiting.toJson()).to.contain('"pullRequest": {');
    expect(awaiting.forgetting().toJson()).to.equal(written.toJson());
    expect(awaiting.pristineCommit().isEqual(written.pristineCommit())).to.be.true;
  });

  it('refuses what it cannot read', () => {
    expect(GenerationRecord.parse('not json')).to.be.undefined;
    expect(GenerationRecord.parse('[]')).to.be.undefined;
    expect(GenerationRecord.parse(json({ schemaVersion: 2 }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ language: 'cobol' }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ stability: 'alpha' }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ pristine: 'HEAD' }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ generatedAt: 'yesterday' }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ cliVersion: 2 }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ pullRequest: 'apimatic/conflict/1' }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ pullRequest: { yours: 'a' } }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ pullRequest: { yours: 'a', generated: 'b', remote: 1 } }))).to.be.undefined;
  });

  it('reads a record an earlier CLI wrote with a conflict list, and drops the list', () => {
    const record = GenerationRecord.parse(json({ conflicts: ['src/index.ts'] }))!;

    expect(
      record.isFor({
        language: Language.TYPESCRIPT,
        codegenVersion: CodeGenerationVersion.V4,
        stability: Stability.STABLE
      })
    ).to.be.true;
    expect(record.toJson()).to.not.contain('conflicts');
  });
});
