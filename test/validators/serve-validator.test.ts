import * as path from "path";
import fsExtra from "fs-extra";
import { expect } from "chai";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";
import { PortalServeValidator } from "../../src/validators/portal/serve-validator.js";
import { ServeFlags, ServePaths } from "../../src/types/portal/serve.js";

describe("PortalServeValidator", () => {
  let TEST_WORKING_DIR: string;
  let TEST_DEST_DIR: string;
  let validator: PortalServeValidator;
  let tmpDirResult: DirectoryResult;

  function getServeFlags(overrides: Partial<ServeFlags> = {}): ServeFlags {
    return {
      port: 3000,
      folder: TEST_WORKING_DIR,
      destination: TEST_DEST_DIR,
      ignore: "",
      open: false,
      "auth-key": "",
      "no-reload": false,
      ...overrides
    };
  }

  function getServePaths(flags: ServeFlags): ServePaths {
    return {
      sourceDirectoryPath: flags.folder,
      destinationDirectoryPath: flags.destination,
      generatedPortalArtifactsDirectoryPath: path.join(flags.destination, "generated_portal"),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, ".generated_portal.zip")
    };
  }

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    TEST_WORKING_DIR = tmpDirResult.path;
    TEST_DEST_DIR = path.join(TEST_WORKING_DIR, "dest");
    await fsExtra.ensureDir(TEST_WORKING_DIR);
    await fsExtra.ensureDir(TEST_DEST_DIR);
    await fsExtra.ensureDir(path.join(TEST_WORKING_DIR, "spec"))
    await fsExtra.writeFile(path.join(TEST_WORKING_DIR, "APIMATIC-BUILD.json"), "{}", "utf8");
    await fsExtra.writeFile(path.join(TEST_WORKING_DIR, "spec", "spec.json"), "{}", "utf8");
    validator = new PortalServeValidator();
  });

  afterEach(async () => {
    await tmpDirResult.cleanup();
  });

  it("should validate existing source directory", async () => {
    const flags = getServeFlags();
    const paths = getServePaths(flags);
    const result = await validator.validateSourceDirectory(paths.sourceDirectoryPath);
    expect(result.isSuccess()).to.be.true;
  });

  it("should validate non-existent source directory", async () => {
    const nonExistentFolder = path.join(TEST_WORKING_DIR, "does-not-exist");
    const flags = getServeFlags({ folder: nonExistentFolder });
    const paths = getServePaths(flags);
    const result = await validator.validateSourceDirectory(paths.sourceDirectoryPath);
    expect(result.isFailed()).to.be.true;
    expect(result.error).to.include("The specified source directory does not exist");
  });

  it("should fail if source directory is empty", async () => {
    const src = path.join(TEST_WORKING_DIR, "no-buildfile-src");
    const dest = path.join(TEST_WORKING_DIR, "no-buildfile-dest");
    await fsExtra.ensureDir(src);
    await fsExtra.ensureDir(dest);
    const flags = getServeFlags({ folder: src, destination: dest });
    const paths = getServePaths(flags);
    const result = await validator.validateSourceDirectory(paths.sourceDirectoryPath);
    expect(result.isFailed()).to.be.true;
    expect(result.error).to.include("The source directory is empty.");
    await fsExtra.remove(src);
    await fsExtra.remove(dest);
  });

  it("should fail if APIMATIC-BUILD.json is missing", async () => {
    const src = path.join(TEST_WORKING_DIR, "no-buildfile-src");
    const dest = path.join(TEST_WORKING_DIR, "no-buildfile-dest");
    await fsExtra.ensureDir(src);
    await fsExtra.ensureDir(dest);
    await fsExtra.ensureDir(path.join(src, "spec"));
    await fsExtra.writeFile(path.join(src, "spec", "spec.json"), "{}", "utf8");
    const flags = getServeFlags({ folder: src, destination: dest });
    const paths = getServePaths(flags);
    const result = await validator.validateSourceDirectory(paths.sourceDirectoryPath);
    expect(result.isFailed()).to.be.true;
    expect(result.error).to.include("The source directory is missing the 'APIMATIC-BUILD.json' file.");
    await fsExtra.remove(src);
    await fsExtra.remove(dest);
  });
}); 