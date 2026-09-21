import { expect } from 'chai';
import { PluginLanguagePlan } from '../../../src/types/plugin/plugin-language-plan';
import { CODEGEN_OPTIONS, Language, v4Languages } from '../../../src/types/sdk/generate';

describe('PluginLanguagePlan', () => {
  describe('create', () => {
    it('splits the picked languages by whether they are already published', () => {
      const plan = PluginLanguagePlan.create(
        [Language.CSHARP, Language.PYTHON, Language.TYPESCRIPT],
        [Language.CSHARP]
      );

      expect(plan.localLanguages()).to.deep.equal([Language.PYTHON, Language.TYPESCRIPT]);
      expect(plan.hasPublished()).to.be.true;
      expect(plan.hasLocal()).to.be.true;
    });

    it('never bundles a published language', () => {
      const plan = PluginLanguagePlan.create([Language.CSHARP], [Language.CSHARP]);

      expect(plan.localLanguages()).to.be.empty;
      expect(plan.hasLocal()).to.be.false;
      expect(plan.hasPublished()).to.be.true;
    });

    it('treats a language with no entry of its own as local', () => {
      const plan = PluginLanguagePlan.create([Language.PYTHON], []);

      expect(plan.localLanguages()).to.deep.equal([Language.PYTHON]);
      expect(plan.hasPublished()).to.be.false;
    });

    it('ignores a published language the user did not pick', () => {
      const plan = PluginLanguagePlan.create([Language.PYTHON], [Language.CSHARP]);

      expect(plan.localLanguages()).to.deep.equal([Language.PYTHON]);
      expect(plan.hasPublished()).to.be.false;
    });

    it('keeps the order the languages were picked in', () => {
      const plan = PluginLanguagePlan.create([Language.TYPESCRIPT, Language.CSHARP, Language.PYTHON], []);

      expect(plan.localLanguages()).to.deep.equal([Language.TYPESCRIPT, Language.CSHARP, Language.PYTHON]);
    });

    it('counts a language named twice once', () => {
      const plan = PluginLanguagePlan.create([Language.PYTHON, Language.PYTHON], []);

      expect(plan.localLanguages()).to.deep.equal([Language.PYTHON]);
    });

    it('is empty when nothing was picked', () => {
      const plan = PluginLanguagePlan.create([], [Language.CSHARP]);

      expect(plan.isEmpty()).to.be.true;
      expect(plan.hasLocal()).to.be.false;
      expect(plan.hasPublished()).to.be.false;
    });

    it('is not empty when something was picked', () => {
      expect(PluginLanguagePlan.create([Language.PYTHON], []).isEmpty()).to.be.false;
    });
  });

  describe('localLanguages', () => {
    it('cannot be used to mutate the plan', () => {
      const plan = PluginLanguagePlan.create([Language.PYTHON], []);

      plan.localLanguages().push(Language.JAVA);

      expect(plan.localLanguages()).to.deep.equal([Language.PYTHON]);
    });
  });
});

describe('v4Languages', () => {
  // Asserted as a property rather than a list so a language reaching v4 needs no test edit.
  it('offers every language a v4 SDK can be generated for', () => {
    for (const language of v4Languages()) {
      expect(
        CODEGEN_OPTIONS[language].some((option) => option.isV4()),
        language
      ).to.be.true;
    }
  });

  it('offers no language without a v4 option', () => {
    const offered = new Set(v4Languages());
    const withoutV4 = Object.values(Language).filter(
      (language) => !CODEGEN_OPTIONS[language].some((option) => option.isV4())
    );

    for (const language of withoutV4) {
      expect(offered.has(language), language).to.be.false;
    }
  });

  it('offers a non-empty set, so the language prompt is never blank', () => {
    expect(v4Languages()).to.not.be.empty;
  });
});
