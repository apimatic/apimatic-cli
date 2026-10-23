import { expect } from 'chai';
import {
  AVAILABLE_LANGUAGES,
  CodeGenerationVersion,
  codegenVersionFor,
  isAvailableLanguage,
  Language,
  LANGUAGE_CHOICES,
  Stability,
  UPCOMING_LANGUAGES
} from '../../../src/types/sdk/generate';

// `UPCOMING_LANGUAGES` is derived from the two lists above it. These are the properties that
// derivation buys, and the reason neither list is maintained by hand.
describe('the languages a generator renders', () => {
  it('accounts for every language exactly once', () => {
    expect([...AVAILABLE_LANGUAGES, ...UPCOMING_LANGUAGES]).to.have.members(Object.values(Language));
  });

  it('names no language as both available and upcoming', () => {
    const both = UPCOMING_LANGUAGES.filter((language) => AVAILABLE_LANGUAGES.includes(language));

    expect(both).to.be.empty;
  });

  // A language a user sees named has to be one the prompts can label.
  it('shows the upcoming ones in the order every other list uses', () => {
    const shown = LANGUAGE_CHOICES.filter((language) => UPCOMING_LANGUAGES.includes(language));

    expect([...UPCOMING_LANGUAGES]).to.deep.equal(shown);
  });

  it('answers for a language named in a config file, not just one already typed', () => {
    expect(isAvailableLanguage('typescript')).to.be.true;
    expect(isAvailableLanguage('java')).to.be.false;
    expect(isAvailableLanguage('cobol')).to.be.false;
  });
});

describe('the generator behind a language and level', () => {
  it('is the one the table offers for that level', () => {
    expect(codegenVersionFor(Language.PYTHON, Stability.BETA)).to.equal(CodeGenerationVersion.V4);
  });

  it('falls back to the generator the language does have, as the default level does', () => {
    expect(codegenVersionFor(Language.JAVA, Stability.STABLE)).to.equal(CodeGenerationVersion.V4);
  });
});
