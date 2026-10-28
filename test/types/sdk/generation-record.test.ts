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
    ...overrides
  });

describe('GenerationRecord', () => {
  it('round-trips through its file form', () => {
    const record = GenerationRecord.written(
      { language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.BETA },
      CommitId.fromGit(SHA)!
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
        `  "pristine": "${SHA}"`,
        '}',
        ''
      ].join('\n')
    );
  });

  it('refuses what it cannot read', () => {
    expect(GenerationRecord.parse('not json')).to.be.undefined;
    expect(GenerationRecord.parse('[]')).to.be.undefined;
    expect(GenerationRecord.parse(json({ schemaVersion: 2 }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ language: 'cobol' }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ stability: 'alpha' }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ pristine: 'HEAD' }))).to.be.undefined;
  });

  it('reads a record an earlier CLI wrote with a conflict list, a date and a version, whatever they hold, and drops them', () => {
    const record = GenerationRecord.parse(
      json({ conflicts: ['src/index.ts'], generatedAt: 'yesterday', cliVersion: 2 })
    )!;

    expect(
      record.isFor({
        language: Language.TYPESCRIPT,
        codegenVersion: CodeGenerationVersion.V4,
        stability: Stability.STABLE
      })
    ).to.be.true;
    expect(record.toJson()).to.not.contain('conflicts');
    expect(record.toJson()).to.not.contain('generatedAt');
    expect(record.toJson()).to.not.contain('cliVersion');
  });
});
