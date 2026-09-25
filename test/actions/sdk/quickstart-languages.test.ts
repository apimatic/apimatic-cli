import { expect } from 'chai';
import { AVAILABLE_LANGUAGES, isAvailableLanguage, Language, mapLanguages } from '../../../src/types/sdk/generate';

/** The language flag a subscription comes back with, built the way the API encodes it. */
const planAllowing = (...languages: Language[]): number => {
  const bits: Readonly<Record<Language, number>> = {
    [Language.CSHARP]: 1,
    [Language.GO]: 2,
    [Language.JAVA]: 4,
    [Language.PHP]: 8,
    [Language.PYTHON]: 16,
    [Language.RUBY]: 32,
    [Language.TYPESCRIPT]: 128
  };
  return languages.reduce((flag, language) => flag | bits[language], 0);
};

// What quickstart offers is the plan and the generator agreeing. Offering a language only the plan
// allows walks the user through four steps to a refusal it could have made before the first one.
describe('the languages sdk quickstart offers', () => {
  const offered = (plan: number) => mapLanguages(plan).filter(isAvailableLanguage);

  it('drops a language the plan allows but no generator renders', () => {
    const plan = planAllowing(Language.JAVA, Language.TYPESCRIPT, Language.GO);

    expect(offered(plan)).to.deep.equal([Language.TYPESCRIPT]);
  });

  it('offers nothing when the plan allows only languages that are still coming', () => {
    const plan = planAllowing(Language.JAVA, Language.RUBY, Language.GO, Language.PHP);

    expect(offered(plan)).to.be.empty;
  });

  // The empty case is what stops the wizard before it imports a spec, so it must not be reachable
  // by a plan that does carry something generatable.
  it('offers every language a full plan and the generator both carry', () => {
    const plan = planAllowing(...Object.values(Language));

    expect(offered(plan)).to.have.members([...AVAILABLE_LANGUAGES]);
  });

  it('offers nothing for a plan that allows nothing', () => {
    expect(offered(0)).to.be.empty;
  });
});
