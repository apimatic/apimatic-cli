import * as path from "path";
import fsExtra from "fs-extra";
import { expect } from "chai";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";
import { ServeHandler } from "../../../../src/application/portal/serve/serve-handler.js";
import { ServeFlags, ServePaths } from "../../../../src/types/portal/serve.js";
import { Result } from "../../../../src/types/common/result.js";

describe("ServeHandler", () => {
  let TEST_WORKING_DIR: string;
  let TEST_DEST_DIR: string;
  let TEST_CONFIG_DIR: string;
  let tmpDirResult: DirectoryResult;
  let flags: ServeFlags;
  let paths: ServePaths;

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    TEST_WORKING_DIR = tmpDirResult.path;
    TEST_DEST_DIR = path.join(TEST_WORKING_DIR, "dest");
    TEST_CONFIG_DIR = path.join(TEST_WORKING_DIR, "config");
    await fsExtra.ensureDir(TEST_WORKING_DIR);
    await fsExtra.ensureDir(TEST_DEST_DIR);
    await fsExtra.ensureDir(TEST_CONFIG_DIR);

    flags = {
      port: 3000,
      folder: TEST_WORKING_DIR,
      destination: TEST_DEST_DIR,
      ignore: "",
      open: false,
      "auth-key": "",
      "no-reload": false
    };
    paths = {
      sourceDirectoryPath: flags.folder,
      destinationDirectoryPath: flags.destination,
      generatedPortalArtifactsDirectoryPath: path.join(flags.destination, "generated_portal"),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, ".generated_portal.zip")
    };
  });

  afterEach(async () => {
    await tmpDirResult.cleanup();
  });

  function createTestServeHandler(listenImpl: any, liveReloadResult = Result.success(35729)) {
    return new (class extends ServeHandler {
      // @ts-ignore
      app = {
        use: () => {},
        listen: listenImpl
      };
      // @ts-ignore
      async createLiveReloadServer() { return liveReloadResult; }
      // @ts-ignore
      async stopServer() {}
    })();
  }

  it("can be constructed", () => {
    const handler = new ServeHandler();
    expect(handler).to.be.instanceOf(ServeHandler);
  });

  it("setupServer returns success for valid path (simulate live reload success)", async () => {
    const handler = createTestServeHandler(() => ({}));
    const result = await handler.setupServer(TEST_DEST_DIR);
    expect(result.isSuccess()).to.be.true;
    expect(result.value).to.include("Server is set up");
  });

  it("setupServer returns failure if createLiveReloadServer fails", async () => {
    const handler = createTestServeHandler(() => ({}), Result.failure("fail"));
    const result = await handler.setupServer(TEST_DEST_DIR);
    expect(result.isFailed()).to.be.true;
    expect(result.error).to.include("fail");
  });

  it("startServer returns success (simulate listen)", async () => {
    const handler = createTestServeHandler(
      (port: number, cb: () => void) => {
        setTimeout(cb, 10);
        return { on: () => ({}) };
      }
    );
    const result = await handler.startServer(paths, flags, [], TEST_CONFIG_DIR, false);
    expect(result.isSuccess()).to.be.true;
  });

  it("startServer returns failure if port is in use (EADDRINUSE)", async () => {
    const handler = createTestServeHandler(
      (port: number, cb: () => void) => ({
        on: (event: string, handler: (err: any) => void) => {
          if (event === "error") setTimeout(() => handler({ code: "EADDRINUSE" }), 10);
          return {};
        }
      })
    );
    try {
      await handler.startServer(paths, flags, [], TEST_CONFIG_DIR, false);
      expect.fail("Should throw for EADDRINUSE");
    } catch (err: any) {
      expect(err.message).to.include("Something went wrong");
    }
  });

  it("startServer returns failure for generic listen error", async () => {
    const handler = createTestServeHandler(
      (port: number, cb: () => void) => ({
        on: (event: string, handler: (err: any) => void) => {
          if (event === "error") setTimeout(() => handler({ code: "SOME_ERROR" }), 10);
          return {};
        }
      })
    );
    try {
      await handler.startServer(paths, flags, [], TEST_CONFIG_DIR, false);
      expect.fail("Should throw for generic error");
    } catch (err: any) {
      expect(err.message).to.include("Something went wrong while serving your portal");
    }
  });
}); 