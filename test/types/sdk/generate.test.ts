import { expect } from "chai";
import {
  CodeGenerationVersion,
  getCodegenOptions,
  Language,
  Stability
} from "../../../src/types/sdk/generate.js";

describe("getCodegenOptions", () => {
  const versionsFor = (language: Language) =>
    getCodegenOptions(language).map((option) => option.codeGenerationVersion());

  it("offers v3 and v4 for the languages the v4 generator supports", () => {
    for (const language of [Language.CSHARP, Language.PYTHON]) {
      expect(versionsFor(language)).to.deep.equal([CodeGenerationVersion.V3, CodeGenerationVersion.V4]);
    }
  });

  it("marks python v4 as beta", () => {
    const v4 = getCodegenOptions(Language.PYTHON).find((option) => option.isV4());

    expect(v4?.stabilityLevel()).to.equal(Stability.BETA);
  });

  // A single option is selected without prompting, so this is what keeps the remaining
  // languages on v3 rather than asking about a generator they cannot use.
  it("offers v3 alone for every other language", () => {
    for (const language of [Language.GO, Language.JAVA, Language.PHP, Language.RUBY, Language.TYPESCRIPT]) {
      expect(versionsFor(language)).to.deep.equal([CodeGenerationVersion.V3]);
    }
  });
});
