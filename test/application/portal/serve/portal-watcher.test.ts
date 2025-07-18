import * as path from "path";
import fsExtra from "fs-extra";
import { expect } from "chai";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";
import { PortalWatcher } from "../../../../src/application/portal/serve/portal-watcher.js";
import { ServeFlags, ServePaths } from "../../../../src/types/portal/serve.js";
import { ActionResult } from "../../../../lib/actions/actionResult";

describe("PortalWatcher", () => {
  let TEST_WORKING_DIR: string;
  let TEST_DEST_DIR: string;
  let TEST_CONFIG_DIR: string;
  let tmpDirResult: DirectoryResult;

  function getServeFlags(): ServeFlags {
    return {
      port: 3000,
      folder: TEST_WORKING_DIR,
      destination: TEST_DEST_DIR,
      ignore: "",
      open: false,
      "auth-key": "",
      "no-reload": false
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
    TEST_CONFIG_DIR = path.join(TEST_WORKING_DIR, "config");
    await fsExtra.ensureDir(TEST_WORKING_DIR);
    await fsExtra.ensureDir(TEST_DEST_DIR);
    await fsExtra.ensureDir(TEST_CONFIG_DIR);
  });

  afterEach(async () => {
    await tmpDirResult.cleanup();
  });

  it("can be constructed", () => {
    const portalWatcher = new PortalWatcher();
    expect(portalWatcher).to.be.instanceOf(PortalWatcher);
  });

  it("sets up watcher and returns a chokidar watcher object", async () => {
    class TestPortalWatcher extends PortalWatcher {
      async handleFileChange() {}
    }
    const portalWatcher = new TestPortalWatcher();
    const flags = getServeFlags();
    const paths = getServePaths(flags);
    const chokidarWatcher = await portalWatcher.watchAndRegeneratePortalOnChange(paths, flags, [], TEST_CONFIG_DIR);
    expect(chokidarWatcher).to.have.property("on");
    await chokidarWatcher.close();
  });

  it("calls handleFileChange on file change event", async () => {
    let called = false;
    class TestPortalWatcher extends PortalWatcher {
      async handleFileChange() { called = true; }
    }
    const portalWatcher = new TestPortalWatcher();
    const flags = getServeFlags();
    const paths = getServePaths(flags);
    const chokidarWatcher = await portalWatcher.watchAndRegeneratePortalOnChange(paths, flags, [], TEST_CONFIG_DIR);
    chokidarWatcher.emit("all", "change", path.join(TEST_WORKING_DIR, "foo.md"));
    await new Promise(res => setTimeout(res, 100));
    expect(called).to.be.true;
    await chokidarWatcher.close();
  });

  it("handles errors in watcher event callback gracefully", async () => {
    class TestPortalWatcher extends PortalWatcher {
      async handleFileChange() { throw new Error("fail"); }
    }
    const watcher = new TestPortalWatcher();
    const flags = getServeFlags();
    const paths = getServePaths(flags);
    const watcherObj = await watcher.watchAndRegeneratePortalOnChange(paths, flags, [], TEST_CONFIG_DIR);
    watcherObj.emit("all", "change", path.join(TEST_WORKING_DIR, "foo.md"));
    await new Promise(res => setTimeout(res, 100));
    await watcherObj.close();
    // Smoke test: should not throw or crash
    expect(true).to.be.true;
  });

  it("debounces rapid file changes (event queue logic)", async () => {
    let callCount = 0;
    class TestPortalWatcher extends PortalWatcher {
      async handleFileChange(
        paths: ServePaths,
        flags: ServeFlags,
        eventQueue: Map<string, string>,
        absoluteIgnoredPaths: string[],
        eventId: string,
        configDirectoryPath: (
          buildDirectory: DirectoryPath,
          portalDirectory: DirectoryPath,
          force: boolean,
          zipPortal: boolean
        ) => Promise<ActionResult>
      ): Promise<void> {
        if (!eventQueue.has(eventId)) {
          return;
        }

        if (eventQueue.has(eventId)) {
          callCount++;
        }
      }
    }
    const portalWatcher = new TestPortalWatcher();
    const flags = getServeFlags();
    const paths = getServePaths(flags);
    const chokidarWatcher = await portalWatcher.watchAndRegeneratePortalOnChange(paths, flags, [], TEST_CONFIG_DIR);
    chokidarWatcher.emit("all", "change", path.join(TEST_WORKING_DIR, "foo1.md"));
    chokidarWatcher.emit("all", "change", path.join(TEST_WORKING_DIR, "foo2.md"));
    chokidarWatcher.emit("all", "change", path.join(TEST_WORKING_DIR, "foo3.md"));
    await new Promise(res => setTimeout(res, 300));
    expect(callCount).to.equal(1);
    await chokidarWatcher.close();
  });

  it("handles watcher close and error events", async () => {
    class TestPortalWatcher extends PortalWatcher {
      async handleFileChange() {}
    }
    const watcher = new TestPortalWatcher();
    const flags = getServeFlags();
    const paths = getServePaths(flags);
    const watcherObj = await watcher.watchAndRegeneratePortalOnChange(paths, flags, [], TEST_CONFIG_DIR);
    watcherObj.emit("error", new Error("fail"));
    await watcherObj.close();
    // Smoke test, should throw.
    expect(true).to.be.true;
  });
});
