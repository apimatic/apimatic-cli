import { expect } from "chai";
import * as path from "path";
import * as fs from "fs-extra";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";
import { PortalNewTocAction } from "../../../../src/actions/portal/new/toc";

describe("PortalNewTocAction", () => {
  let TEST_WORKING_DIR: string;
  let TEST_CONFIG_DIR: string;
  let portalNewTocAction: PortalNewTocAction;
  let tmpDirResult: DirectoryResult;

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    TEST_WORKING_DIR = tmpDirResult.path;
    TEST_CONFIG_DIR = path.join(TEST_WORKING_DIR, "config");
    portalNewTocAction = new PortalNewTocAction();
    
    await fs.ensureDir(TEST_WORKING_DIR);
    await fs.ensureDir(path.join(TEST_WORKING_DIR, "content"));
  });

  afterEach(async () => {
    await tmpDirResult.cleanup();
  });

  describe("createToc", () => {
    it("should create TOC file at default location", async () => {
      const expectedTocPath = path.join(TEST_WORKING_DIR, "content", "toc.yml");

      const result = await portalNewTocAction.createToc(
        TEST_WORKING_DIR,
        TEST_CONFIG_DIR,
        undefined,
        true
      );

      expect(result.isSuccess()).to.be.true;
      expect(await fs.pathExists(expectedTocPath)).to.be.true;
      
      const tocContent = await fs.readFile(expectedTocPath, "utf8");
      expect(tocContent).to.include("Getting Started");
      expect(tocContent).to.include("API Endpoints");
      expect(tocContent).to.include("Models");
      expect(tocContent).to.include("SDK Infrastructure");
    });

    it("should create TOC file at custom location", async () => {
      const customDestination = path.join(TEST_WORKING_DIR, "custom");
      await fs.ensureDir(customDestination);
      const expectedTocPath = path.join(customDestination, "toc.yml");

      const result = await portalNewTocAction.createToc(
        TEST_WORKING_DIR,
        TEST_CONFIG_DIR,
        customDestination,
        true
      );

      expect(result.isSuccess()).to.be.true;
      expect(await fs.pathExists(expectedTocPath)).to.be.true;
      
      await fs.remove(customDestination);
    });
  });
}); 