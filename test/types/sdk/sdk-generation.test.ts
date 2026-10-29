import { expect } from 'chai';
import { CodeGenerationVersion, Language, Stability } from '../../../src/types/sdk/generate.js';
import { SdkGeneration } from '../../../src/types/sdk/sdk-generation.js';

const request = (language: Language, stability: Stability) => ({
  language,
  codegenVersion: CodeGenerationVersion.V4,
  stability
});

describe('SdkGeneration', () => {
  const stable = SdkGeneration.create(request(Language.PYTHON, Stability.STABLE))!;

  it('is created only for what a generator offers, and recorded for whatever a record says', () => {
    expect(SdkGeneration.create(request(Language.PYTHON, Stability.BETA))).to.not.be.undefined;
    expect(SdkGeneration.create(request(Language.JAVA, Stability.STABLE))).to.be.undefined;
    expect(SdkGeneration.recorded(request(Language.JAVA, Stability.STABLE)).language).to.equal(Language.JAVA);
  });

  it('is the same generation only when language, generator and level all agree', () => {
    expect(stable.isSameAs(SdkGeneration.create(request(Language.PYTHON, Stability.STABLE))!)).to.be.true;
    expect(stable.isSameAs(SdkGeneration.create(request(Language.PYTHON, Stability.BETA))!)).to.be.false;
  });

  it('names itself for a commit message', () => {
    expect(String(stable)).to.equal('python v4 stable');
  });
});
