import * as path from "path";
import fsExtra from "fs-extra";
import { expect } from "chai";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";
import { PortalNewTocAction } from "../../../../src/actions/portal/toc/new-toc.js";
import { DirectoryPath } from "../../../../src/types/file/directoryPath.js";
import { CommandMetadata } from "../../../../src/types/common/command-metadata.js";

const COMMAND_METADATA: CommandMetadata = { commandName: "portal toc new", shell: "test" };

// `portal toc new` used to fall back to the default TOC when it had no spec to
// extract from — writing a toc.yml with no Endpoints, Events or Models sections
// over a possibly valid file, and exiting 0. The spec is now required. These
// cases return before any request is made, so no service stubbing is needed.
describe("PortalNewTocAction spec directory requirement", () => {
  let tmpDirResult: DirectoryResult;
  let buildDirectory: string;
  let action: PortalNewTocAction;

  const execute = () => action.execute(new DirectoryPath(buildDirectory));

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    buildDirectory = path.join(tmpDirResult.path, "build");
    await fsExtra.ensureDir(buildDirectory);
    // `BuildContext.validate()` only checks that the build file exists — the
    // spec checks run before its contents are ever read.
    await fsExtra.writeJson(path.join(buildDirectory, "APIMATIC-BUILD.json"), {});

    action = new PortalNewTocAction(new DirectoryPath(tmpDirResult.path), COMMAND_METADATA);
  });

  afterEach(async () => {
    await tmpDirResult.cleanup();
  });

  it("fails when the spec directory is missing", async () => {
    const result = await execute();

    expect(result.isFailed()).to.be.true;
  });

  it("fails when the spec directory exists but is empty", async () => {
    await fsExtra.ensureDir(path.join(buildDirectory, "spec"));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
  });

  it("fails when the spec directory holds only dotfiles", async () => {
    // `FileService.directoryEmpty` filters dot-prefixed entries, so a spec
    // directory kept alive by a .gitkeep still has nothing to extract.
    const specDirectory = path.join(buildDirectory, "spec");
    await fsExtra.ensureDir(specDirectory);
    await fsExtra.writeFile(path.join(specDirectory, ".gitkeep"), "");

    const result = await execute();

    expect(result.isFailed()).to.be.true;
  });

  it("writes no toc.yml when the spec is missing", async () => {
    await execute();

    const written = await fsExtra.readdir(buildDirectory);
    expect(written).to.deep.equal(["APIMATIC-BUILD.json"]);
  });
});
