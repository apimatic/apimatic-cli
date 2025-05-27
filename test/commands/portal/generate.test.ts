import * as fs from "fs";
import * as fsExtra from "fs-extra";
import * as path from "path";
import * as nock from "nock";
import { expect } from "chai";
import { runCommand } from "@oclif/test";
import { SimpleGitOptions } from "simple-git";
import simpleGit from "simple-git";
import { baseURL, staticPortalRepoUrl } from "../../../src/config/env";
import { EventEmitter } from "events";
EventEmitter.defaultMaxListeners = 50;

const COMMAND = "portal:generate";
const GENERATION_SUCCESS_MESSAGE = "Portal generated successfully";
const GENERATION_FAILURE_MESSAGE = "Something went wrong while generating your portal";
const AUTHENTICATION_FAILURE_MESSAGE = "Authorization has been denied for this request";
const VALIDATION_FAILURE_MESSAGE = "One or more validation errors occurred";
const BUILD_FILE_MISSING_MESSAGE = "APIMatic Build file is missing, portal cannot be generated";
const SUBSCRIPTION_FAILURE_MESSAGE = "Access denied to resource";
const SUBSCRIPTION_FAILURE_DETAILS_MESSAGE = "Requested features are not available in subscription";

async function setupValidBuildDirectory(targetFolder: string): Promise<void> {
  const options: Partial<SimpleGitOptions> = {
    timeout: {
      block: 60 * 1000 // 1 minute timeout.
    }
  };
  const git = simpleGit(options);
  try {
    await git.clone(staticPortalRepoUrl, targetFolder);
  } catch (error) {
    throw new Error("Failed to setup valid build directory: " + (error as Error).message);
  }

  await fsExtra.remove(path.join(targetFolder, ".git"));
  await fsExtra.remove(path.join(targetFolder, ".github"));
}

describe("apimatic portal:generate", function () {
  const portalArtifactsDir = path.join(process.cwd(), "test-portal");
  const sourceBuildInputDir = path.join(process.cwd(), "test-source");

  const cleanTestDir = () => {
    if (fs.existsSync(portalArtifactsDir)) {
      fs.rmSync(portalArtifactsDir, { recursive: true, force: true });
    }
    if (fs.existsSync(sourceBuildInputDir)) {
      fs.rmSync(sourceBuildInputDir, { recursive: true, force: true });
    }
  };

  beforeEach(() => {
    cleanTestDir();
    fs.mkdirSync(sourceBuildInputDir);
    fs.mkdirSync(portalArtifactsDir);
  });

  afterEach(() => {
    cleanTestDir();
    nock.cleanAll();
    nock.restore();
  });

  // Basic command execution
  it("runs portal:generate with default flags and valid build input", async () => {
    await setupValidBuildDirectory(sourceBuildInputDir);
    const { stdout, stderr } = await runCommand([
      COMMAND,
      "--folder",
      sourceBuildInputDir,
      "--destination",
      portalArtifactsDir
    ]);
    expect(stderr).to.be.empty;
    expect(stdout).to.contain(GENERATION_SUCCESS_MESSAGE);
    expect(fs.existsSync(path.join(portalArtifactsDir, "generated_portal"))).to.be.true;
  });

  // Flag validation
  it("validates source folder path exists", async () => {
    const { stdout, error } = await runCommand([COMMAND, "--folder", "non-existent-folder"]);
    expect(stdout).to.contain(GENERATION_FAILURE_MESSAGE);
    expect(error?.message).to.contain("does not exist");
  });

  it("validates destination path exists", async () => {
    const { stdout, error } = await runCommand([COMMAND, "--destination", "non-existent-destination"]);
    expect(stdout).to.contain(GENERATION_FAILURE_MESSAGE);
    expect(error?.message).to.contain("does not exist");
  });

  it("validates APIMatic build file exists", async () => {
    await setupValidBuildDirectory(sourceBuildInputDir);
    fs.rmSync(path.join(sourceBuildInputDir, "APIMATIC-BUILD.json"));
    const { stdout, error } = await runCommand([
      COMMAND,
      "--folder",
      sourceBuildInputDir,
      "--destination",
      portalArtifactsDir
    ]);
    expect(stdout).to.contain(GENERATION_FAILURE_MESSAGE);
    expect(error?.message).to.contain(BUILD_FILE_MISSING_MESSAGE);
  });

  // File system operations
  describe("file system operations", () => {
    it("creates portal directory with correct structure", async () => {
      await setupValidBuildDirectory(sourceBuildInputDir);
      await runCommand([COMMAND, "--folder", sourceBuildInputDir, "--destination", portalArtifactsDir]);
      expect(fs.existsSync(path.join(portalArtifactsDir, "generated_portal"))).to.be.true;
      expect(fs.existsSync(path.join(portalArtifactsDir, "generated_portal", "index.html"))).to.be.true;
    });

    it("creates zip file when --zip flag is used", async () => {
      await setupValidBuildDirectory(sourceBuildInputDir);
      await runCommand([COMMAND, "--folder", sourceBuildInputDir, "--destination", portalArtifactsDir, "--zip"]);
      expect(fs.existsSync(path.join(portalArtifactsDir, ".generated_portal.zip"))).to.be.true;
    });

    it("overwrites existing portal with --force", async () => {
      await setupValidBuildDirectory(sourceBuildInputDir);
      fs.mkdirSync(path.join(portalArtifactsDir, "generated_portal"));
      const { stdout } = await runCommand([
        COMMAND,
        "--folder",
        sourceBuildInputDir,
        "--destination",
        portalArtifactsDir,
        "--force"
      ]);
      expect(stdout).to.contain(GENERATION_SUCCESS_MESSAGE);
    });

    it("generates and zips portal while forcefully overwriting existing portal in one command", async () => {
      await setupValidBuildDirectory(sourceBuildInputDir);
      const { stdout } = await runCommand([
        COMMAND,
        "--folder",
        sourceBuildInputDir,
        "--destination",
        portalArtifactsDir,
        "--zip",
        "--force"
      ]);
      expect(stdout).to.contain(GENERATION_SUCCESS_MESSAGE);
      expect(fs.existsSync(path.join(portalArtifactsDir, ".generated_portal.zip"))).to.be.true;
    });
  });

  // API error responses handling
  describe("API error responses", () => {
    it("throws 400 error due to invalid APIMatic build file", async () => {
      await setupValidBuildDirectory(sourceBuildInputDir);
      fs.writeFileSync(
        path.join(sourceBuildInputDir, "APIMATIC-BUILD.json"),
        JSON.stringify({
          dummy: "dummyValue"
        })
      );
      const { stdout, error } = await runCommand([
        COMMAND,
        "--folder",
        sourceBuildInputDir,
        "--destination",
        portalArtifactsDir
      ]);
      expect(stdout).to.contain(GENERATION_FAILURE_MESSAGE);
      expect(error?.message).to.contain(VALIDATION_FAILURE_MESSAGE);
      expect(error?.message).to.contain(
        "No build tasks provided. Both generatePortal and generateVersionedPortal are null"
      );
    });

    it("throws 401 error due to invalid authentication key", async () => {
      await setupValidBuildDirectory(sourceBuildInputDir);
      const { stdout, error } = await runCommand([
        COMMAND,
        "--folder",
        sourceBuildInputDir,
        "--destination",
        portalArtifactsDir,
        "--auth-key",
        "invalid-auth-key"
      ]);
      expect(stdout).to.contain(GENERATION_FAILURE_MESSAGE);
      expect(error?.message).to.contain(AUTHENTICATION_FAILURE_MESSAGE);
    });

    it("throws 403 error due to subscription error", async () => {
      nock.disableNetConnect();
      await setupValidBuildDirectory(sourceBuildInputDir);

      nock(baseURL)
        .post("/portal")
        .matchHeader("Authorization", "X-Auth-Key valid-but-restricted-auth-key")
        .matchHeader("Content-Type", (val) => val?.startsWith("multipart/form-data"))
        .reply(403, {
          type: "https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.3",
          title: "Access denied to resource.",
          status: 403,
          detail: "Requested features are not available in subscription",
          instance: "/api/portal",
          errors: {
            "": ["Unsupported languages provided in build file 'CS_NET_STANDARD_LIB'"]
          }
        });

      const { stdout, error } = await runCommand([
        COMMAND,
        "--folder",
        sourceBuildInputDir,
        "--destination",
        portalArtifactsDir,
        "--auth-key",
        "valid-but-restricted-auth-key"
      ]);
      expect(stdout).to.contain(GENERATION_FAILURE_MESSAGE);
      expect(error?.message).to.contain(SUBSCRIPTION_FAILURE_MESSAGE);
      expect(error?.message).to.contain(SUBSCRIPTION_FAILURE_DETAILS_MESSAGE);
      expect(error?.message).to.contain("Unsupported languages provided in build file 'CS_NET_STANDARD_LIB'");
      nock.enableNetConnect();
    });

    it("throw 422 error due to validation issues related to toc", async () => {
      const INVALID_TOC_YAML = `toc:
  - group: My Guides
    items:
      - page: Guide Page 1
        file: guide1.md
      - page: Guide Page 2
        `;
      
      await setupValidBuildDirectory(sourceBuildInputDir);
      fs.writeFileSync(path.join(sourceBuildInputDir, "content", "guides", "toc.yml"), INVALID_TOC_YAML);

      const { stdout, error } = await runCommand([
        COMMAND,
        "--folder",
        sourceBuildInputDir,
        "--destination",
        portalArtifactsDir
      ]);
      expect(stdout).to.contain(GENERATION_FAILURE_MESSAGE);
      expect(error?.message).to.contain(
        "An error occurred during portal generation due to an issue with the input. An error report has been written at the destination path"
      );
      expect(fs.existsSync(path.join(portalArtifactsDir, "generated_portal", "apimatic-debug", "apimatic-report.html")))
        .to.be.true;
    });
  });
});
