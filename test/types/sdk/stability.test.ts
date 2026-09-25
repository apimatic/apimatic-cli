import { expect } from 'chai';
import {
  AVAILABLE_LANGUAGES,
  defaultStability,
  Language,
  Stability,
  stabilityLevelsFor
} from '../../../src/types/sdk/generate';

// The flag's own default is one string for every language. What a language actually offers is
// what an unasked run has to send, or the service refuses a request the caller did nothing to
// shape: v4 renders every language it supports at beta, and `stable` is refused by name.
describe('the stability a language offers', () => {
  it('offers beta, and only beta, for every language v4 renders', () => {
    for (const language of AVAILABLE_LANGUAGES) {
      expect([...stabilityLevelsFor(language)], language).to.deep.equal([Stability.BETA]);
    }
  });

  it('defaults each of them to beta, which is the level the service accepts', () => {
    for (const language of AVAILABLE_LANGUAGES) {
      expect(defaultStability(language), language).to.equal(Stability.BETA);
    }
  });

  // A language that reaches stable stops being a special case without anything here changing.
  it('falls back to stable for a language with no table entry', () => {
    expect(defaultStability(Language.JAVA)).to.equal(Stability.STABLE);
  });
});
