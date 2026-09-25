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
// shape: v4 renders every language it supports at both levels, and the first is what it sends.
describe('the stability a language offers', () => {
  it('offers both levels for every language v4 renders', () => {
    for (const language of AVAILABLE_LANGUAGES) {
      expect([...stabilityLevelsFor(language)], language).to.deep.equal([Stability.STABLE, Stability.BETA]);
    }
  });

  it('defaults each of them to stable, which is the level a caller who says nothing means', () => {
    for (const language of AVAILABLE_LANGUAGES) {
      expect(defaultStability(language), language).to.equal(Stability.STABLE);
    }
  });

  // A language with no table entry is not generatable at all, so the fallback only has to be a
  // level the service knows rather than the right one.
  it('falls back to stable for a language with no table entry', () => {
    expect(defaultStability(Language.JAVA)).to.equal(Stability.STABLE);
  });
});
