import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
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
    conflicts: [],
    ...overrides
  });

const rel = (value: string) => RelativeFilePath.fromGit(value);

describe('GenerationRecord', () => {
  it('round-trips through its file form', () => {
    const record = GenerationRecord.written(
      { language: Language.PYTHON, codegenVersion: CodeGenerationVersion.V4, stability: Stability.BETA },
      CommitId.create(SHA)!,
      new Date('2026-10-20T10:00:00Z'),
      '2.3.0',
      [rel('src/models/book.py')]
    );

    const parsed = GenerationRecord.parse(record.toJson())!;

    expect(parsed.toJson()).to.equal(record.toJson());
    expect(parsed.hasConflicts()).to.be.true;
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
        '  "cliVersion": "2.3.0",',
        '  "conflicts": []',
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
    expect(GenerationRecord.parse(json({ generatedAt: 'yesterday' }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ conflicts: 'src/index.ts' }))).to.be.undefined;
    expect(GenerationRecord.parse(json({ cliVersion: 2 }))).to.be.undefined;
  });
});
