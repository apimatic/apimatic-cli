import * as path from "path";
import { expect } from "chai";
import sinon from "sinon";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";
import { PortalGenerateAction } from "../../../../src/actions/portal/generate.js";
import * as utils from "../../../../src/utils/utils.js";
import * as fsExtra from "fs-extra";
import { PortalService } from "../../../../src/infrastructure/services/portal-service.js";
import { PortalGeneratePrompts } from "../../../../src/prompts/portal/generate.js";
import { Result } from "../../../../src/types/common/result.js";
import { Readable } from "stream";

describe("PortalGenerateAction", () => {
  let tmpDirResult: DirectoryResult;
  let action: PortalGenerateAction;
  let sandbox: sinon.SinonSandbox;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    // Mock prompts to avoid console output
    sandbox.stub(PortalGeneratePrompts.prototype, "displayPortalGenerationMessage");
    sandbox.stub(PortalGeneratePrompts.prototype, "displayPortalGenerationSuccessMessage");
    sandbox.stub(PortalGeneratePrompts.prototype, "displayOutroMessage");
    sandbox.stub(PortalGeneratePrompts.prototype, "displayPortalGenerationErrorMessage");
    sandbox.stub(PortalGeneratePrompts.prototype, "logError");
    action = new PortalGenerateAction();
  });

  afterEach(async () => {
    sandbox.restore();
    await tmpDirResult.cleanup();
  });

  // Helper to get default params
  function getDefaultParams() {
    const sourceFolderPath = tmpDirResult.path;
    return {
      paths: {
        sourceFolderPath,
        generatedPortalArtifactsFolderPath: path.join(sourceFolderPath, "out"),
        generatedPortalArtifactsZipFilePath: path.join(sourceFolderPath, "out.zip"),
        destinationFolderPath: path.join(sourceFolderPath, "out")
      },
      flags: {
        zip: false,
        folder: "",         // or a suitable test value
        destination: "",    // or a suitable test value
        force: false,       // or true, as needed
        "auth-key": ""    // or a string if you want to test auth
      },
      configDir: path.join(sourceFolderPath, "config"),
    };
  }

  it("should generate portal without zip flag", async () => {
    // Arrange
  });

  it("should generate portal with zip flag", async () => {
    // Similar to above, but set flags.zip = true and assert correct prompt methods called
  });

  it("should use custom auth key", async () => {
    // Set flags["auth-key"] = "my-key" and assert it's passed to PortalService
  });

  it("should handle portal service failure", async () => {
    // Make generateOnPremPortal return Result.failure("error") and assert error prompt called
  });

  it("should handle validation and zip failures", async () => {
    // Make validateAndZipPortalSource throw/reject and assert error prompt called
  });

  it("should handle stream write errors", async () => {
    // Make createWriteStream's pipe emit "error" and assert error prompt called
  });

  it("should handle extraction failures", async () => {
    // Make extractZipFile throw/reject and assert error prompt called
  });
});