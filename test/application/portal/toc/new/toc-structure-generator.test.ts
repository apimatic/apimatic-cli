import { expect } from "chai";
import { TocStructureGenerator } from "../../../../../src/application/portal/toc/toc-structure-generator.js";
import { TocEndpoint, TocGroup, Toc, TocCustomPage } from "../../../../../src/types/toc/toc.js";

describe("TocStructureGenerator", () => {
  let tocStructureGenerator: TocStructureGenerator;

  beforeEach(() => {
    tocStructureGenerator = new TocStructureGenerator();
  });

  describe("transformToYaml", () => {
    it("should generate valid YAML", () => {
      const toc: Toc = {
        toc: [{
          group: "Test Group",
          items: [{
            page: "Test Page",
            file: "test.md"
          } as TocCustomPage]
        } as TocGroup]
      };

      const result = tocStructureGenerator.transformToYaml(toc);

      expect(result).to.include("toc:");
      expect(result).to.include("group: Test Group");
      expect(result).to.include("page: Test Page");
      expect(result).to.include("file: test.md");
    });

    it("should handle null values correctly", () => {
      const toc: Toc = {
        toc: [{
          group: "Test Group",
          items: [{
            generate: null,
            from: "endpoint",
            endpointName: "Test",
            endpointGroup: "Test Group"
          } as TocEndpoint]
        } as TocGroup]
      };

      const result = tocStructureGenerator.transformToYaml(toc);

      expect(result).to.include("generate:");
      expect(result).to.not.include("generate: null");
    });
  });
});
