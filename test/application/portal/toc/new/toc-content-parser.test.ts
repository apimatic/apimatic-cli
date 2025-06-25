import * as path from "path";
import fsExtra from "fs-extra";
import { expect } from "chai";
import { TocContentParser } from "../../../../../src/application/portal/toc/toc-content-parser.js";
import { TocGroup } from "../../../../../src/types/toc/toc.js";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";

describe("TocContentParser", () => {
  let TEST_CONFIG_DIR: string;
  let TEST_CONTENT_DIR: string;
  let tmpDirResult: DirectoryResult;
  let tocContentParser: TocContentParser;

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    TEST_CONFIG_DIR = tmpDirResult.path;
    TEST_CONTENT_DIR = path.join(TEST_CONFIG_DIR, "content");
    tocContentParser = new TocContentParser();
    await fsExtra.ensureDir(TEST_CONTENT_DIR);
  });

  afterEach(async () => {
    await tmpDirResult.cleanup();
  });

  describe("parseContentFolder", () => {
    it("should parse flat directory structure", async () => {
      await fsExtra.writeFile(path.join(TEST_CONTENT_DIR, "guide1.md"), "# Guide 1");
      await fsExtra.writeFile(path.join(TEST_CONTENT_DIR, "guide2.md"), "# Guide 2");

      const result = await tocContentParser.parseContentFolder(TEST_CONTENT_DIR, TEST_CONTENT_DIR);

      expect(result).to.have.lengthOf(1);
      const customContentGroup = result[0] as TocGroup;
      expect(customContentGroup.group).to.equal("Custom Content");
      expect(customContentGroup.items).to.have.lengthOf(2);
      expect(customContentGroup.items[0]).to.deep.include({
        page: "guide1",
        file: "guide1.md"
      });
      expect(customContentGroup.items[1]).to.deep.include({
        page: "guide2",
        file: "guide2.md"
      });
    });

    it("should parse nested directory structure", async () => {
      const nestedDir = path.join(TEST_CONTENT_DIR, "guides");
      await fsExtra.ensureDir(nestedDir);
      await fsExtra.writeFile(path.join(nestedDir, "guide1.md"), "# Guide 1");
      await fsExtra.writeFile(path.join(nestedDir, "guide2.md"), "# Guide 2");

      const result = await tocContentParser.parseContentFolder(TEST_CONTENT_DIR, TEST_CONTENT_DIR);

      expect(result).to.have.lengthOf(1);
      const customContentGroup = result[0] as TocGroup;
      expect(customContentGroup.group).to.equal("Custom Content");
      expect(customContentGroup.items).to.have.lengthOf(1);
      
      const guidesGroup = customContentGroup.items[0] as TocGroup;
      expect(guidesGroup.group).to.equal("guides");
      expect(guidesGroup.items).to.have.lengthOf(2);
      expect(guidesGroup.items[0]).to.deep.include({
        page: "guide1",
        file: "guides/guide1.md"
      });
      expect(guidesGroup.items[1]).to.deep.include({
        page: "guide2",
        file: "guides/guide2.md"
      });
    });

    it("should handle empty directories", async () => {
      const result = await tocContentParser.parseContentFolder(TEST_CONTENT_DIR, TEST_CONTENT_DIR);
      expect(result).to.have.lengthOf(0);
    });

    it("should only include markdown files", async () => {
      await fsExtra.writeFile(path.join(TEST_CONTENT_DIR, "guide1.md"), "# Guide 1");
      await fsExtra.writeFile(path.join(TEST_CONTENT_DIR, "image.png"), "binary content");
      await fsExtra.writeFile(path.join(TEST_CONTENT_DIR, "data.json"), "{}");

      const result = await tocContentParser.parseContentFolder(TEST_CONTENT_DIR, TEST_CONTENT_DIR);

      expect(result).to.have.lengthOf(1);
      const customContentGroup = result[0] as TocGroup;
      expect(customContentGroup.items).to.have.lengthOf(1);
      expect(customContentGroup.items[0]).to.deep.include({
        page: "guide1",
        file: "guide1.md"
      });
    });

    it("should generate correct relative paths", async () => {
      const workingDir = path.join(TEST_CONTENT_DIR, "..");
      const nestedDir = path.join(TEST_CONTENT_DIR, "guides");
      await fsExtra.ensureDir(nestedDir);
      await fsExtra.writeFile(path.join(nestedDir, "guide1.md"), "# Guide 1");

      const result = await tocContentParser.parseContentFolder(TEST_CONTENT_DIR, workingDir);

      const customContentGroup = result[0] as TocGroup;
      const guidesGroup = customContentGroup.items[0] as TocGroup;
      expect(guidesGroup.items[0]).to.deep.include({
        page: "guide1",
        file: "content/guides/guide1.md"
      });
    });
  });

  describe("normalizePath", () => {
    it("should convert Windows paths to forward slashes", () => {
      const windowsPath = "content\\guides\\guide1.md";
      const result = tocContentParser["normalizePath"](windowsPath);
      expect(result).to.equal("content/guides/guide1.md");
    });

    it("should handle already normalized paths", () => {
      const normalizedPath = "content/guides/guide1.md";
      const result = tocContentParser["normalizePath"](normalizedPath);
      expect(result).to.equal("content/guides/guide1.md");
    });

    it("should handle empty paths", () => {
      const result = tocContentParser["normalizePath"]("");
      expect(result).to.equal("");
    });
  });
}); 