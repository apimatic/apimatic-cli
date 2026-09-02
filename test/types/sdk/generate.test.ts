import { expect } from 'chai';
import {
  CodeGenerationVersion,
  CodegenOption,
  getCodegenOptions,
  Language,
  Stability
} from '../../../src/types/sdk/generate';

const versionsOf = (language: Language) =>
  getCodegenOptions(language).map((option) => option.codeGenerationVersion());

describe('getCodegenOptions', () => {
  it('offers V4 for typescript', () => {
    expect(versionsOf(Language.TYPESCRIPT)).to.deep.equal([CodeGenerationVersion.V3, CodeGenerationVersion.V4]);
  });

  it('offers typescript V4 as beta', () => {
    const v4 = getCodegenOptions(Language.TYPESCRIPT).find((option) => option.isV4());
    expect(v4?.stabilityLevel()).to.equal(Stability.BETA);
  });

  it('lists V3 first so it stays the initial selection', () => {
    for (const language of Object.values(Language)) {
      expect(getCodegenOptions(language)[0], language).to.equal(CodegenOption.v3);
    }
  });
});
