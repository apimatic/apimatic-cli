import { expect } from 'chai';
import {
  isPluginLanguage,
  Language,
  LANGUAGE_CHOICES,
  PLUGIN_LANGUAGES,
  UPCOMING_LANGUAGES
} from '../../../src/types/sdk/generate';

// `UPCOMING_LANGUAGES` is derived from the two lists above it. These are the properties that
// derivation buys, and the reason neither list is maintained by hand.
describe('the languages a plugin can carry', () => {
  it('accounts for every language exactly once', () => {
    expect([...PLUGIN_LANGUAGES, ...UPCOMING_LANGUAGES]).to.have.members(Object.values(Language));
  });

  it('names no language as both carried and upcoming', () => {
    const both = UPCOMING_LANGUAGES.filter((language) => PLUGIN_LANGUAGES.includes(language));

    expect(both).to.be.empty;
  });

  // A language a user sees named has to be one the prompts can label.
  it('shows the upcoming ones in the order every other list uses', () => {
    const shown = LANGUAGE_CHOICES.map((choice) => choice.value).filter((language) =>
      UPCOMING_LANGUAGES.includes(language)
    );

    expect([...UPCOMING_LANGUAGES]).to.deep.equal(shown);
  });

  it('answers for a language named in a config file, not just one already typed', () => {
    expect(isPluginLanguage('typescript')).to.be.true;
    expect(isPluginLanguage('java')).to.be.false;
    expect(isPluginLanguage('cobol')).to.be.false;
  });
});
