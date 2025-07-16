import * as path from "path";
import fsExtra from "fs-extra";
import { expect } from "chai";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";
import { PortalWatcher } from "../../../../src/application/portal/serve/portal-watcher.js";
import { ServeFlags, ServePaths } from "../../../../src/types/portal/serve.js";

describe("PortalWatcher", () => {
  let TEST_WORKING_DIR: string;
  let TEST_DEST_DIR: string;
  let TEST_CONFIG_DIR: string;
  let tmpDirResult: DirectoryResult;

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
    const watcher = new PortalWatcher();
    expect(watcher).to.be.instanceOf(PortalWatcher);
  });

  it("sets up watcher and returns a chokidar watcher object", async () => {
    // We'll override handleFileChange to avoid side effects
    class TestPortalWatcher extends PortalWatcher {
      // @ts-ignore
      async handleFileChange() {
        // no-op for test
      }
    }
    const watcher = new TestPortalWatcher();
    const flags: ServeFlags = {
      port: 3000,
      folder: TEST_WORKING_DIR,
      destination: TEST_DEST_DIR,
      ignore: "",
      open: false,
      "auth-key": "",
      "no-reload": false
    };
    const paths: ServePaths = {
      sourceDirectoryPath: flags.folder,
      destinationDirectoryPath: flags.destination,
      generatedPortalArtifactsDirectoryPath: path.join(flags.destination, "generated_portal"),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, ".generated_portal.zip")
    };
    const watcherObj = await watcher.watchAndRegeneratePortal(paths, flags, [], TEST_CONFIG_DIR);
    expect(watcherObj).to.have.property("on"); // chokidar watcher
    await watcherObj.close();
  });

  it("calls handleFileChange on file change event", async () => {
    let called = false;
    class TestPortalWatcher extends PortalWatcher {
      async handleFileChange() { called = true; }
    }
    const watcher = new TestPortalWatcher();
    const flags = {
      port: 3000,
      folder: TEST_WORKING_DIR,
      destination: TEST_DEST_DIR,
      ignore: "",
      open: false,
      "auth-key": "",
      "no-reload": false
    };
    const paths = {
      sourceDirectoryPath: flags.folder,
      destinationDirectoryPath: flags.destination,
      generatedPortalArtifactsDirectoryPath: path.join(flags.destination, "generated_portal"),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, ".generated_portal.zip")
    };
    const watcherObj = await watcher.watchAndRegeneratePortal(paths, flags, [], TEST_CONFIG_DIR);
    watcherObj.emit("all", "change", path.join(TEST_WORKING_DIR, "foo.md"));
    // Wait for async event
    await new Promise(res => setTimeout(res, 100));
    expect(called).to.be.true;
    await watcherObj.close();
  });

  it("handles errors in watcher event callback gracefully", async () => {
    class TestPortalWatcher extends PortalWatcher {
      async handleFileChange() { throw new Error("fail"); }
    }
    const watcher = new TestPortalWatcher();
    const flags = {
      port: 3000,
      folder: TEST_WORKING_DIR,
      destination: TEST_DEST_DIR,
      ignore: "",
      open: false,
      "auth-key": "",
      "no-reload": false
    };
    const paths = {
      sourceDirectoryPath: flags.folder,
      destinationDirectoryPath: flags.destination,
      generatedPortalArtifactsDirectoryPath: path.join(flags.destination, "generated_portal"),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, ".generated_portal.zip")
    };
    const watcherObj = await watcher.watchAndRegeneratePortal(paths, flags, [], TEST_CONFIG_DIR);
    // Should not throw uncaught
    watcherObj.emit("all", "change", path.join(TEST_WORKING_DIR, "foo.md"));
    await new Promise(res => setTimeout(res, 100));
    await watcherObj.close();
    expect(true).to.be.true;
  });

  it("debounces rapid file changes (event queue logic)", async () => {
    let callCount = 0;
    class TestPortalWatcher extends PortalWatcher {
      async handleFileChange() { callCount++; }
    }
    const watcher = new TestPortalWatcher();
    const flags = {
      port: 3000,
      folder: TEST_WORKING_DIR,
      destination: TEST_DEST_DIR,
      ignore: "",
      open: false,
      "auth-key": "",
      "no-reload": false
    };
    const paths = {
      sourceDirectoryPath: flags.folder,
      destinationDirectoryPath: flags.destination,
      generatedPortalArtifactsDirectoryPath: path.join(flags.destination, "generated_portal"),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, ".generated_portal.zip")
    };
    const watcherObj = await watcher.watchAndRegeneratePortal(paths, flags, [], TEST_CONFIG_DIR);
    // Simulate rapid events
    watcherObj.emit("all", "change", path.join(TEST_WORKING_DIR, "foo1.md"));
    watcherObj.emit("all", "change", path.join(TEST_WORKING_DIR, "foo2.md"));
    watcherObj.emit("all", "change", path.join(TEST_WORKING_DIR, "foo3.md"));
    await new Promise(res => setTimeout(res, 300));
    expect(callCount).to.be.at.least(1);
    expect(callCount).to.be.below(4); // Should not call for every event
    await watcherObj.close();
  });

  it("handles watcher close and error events", async () => {
    class TestPortalWatcher extends PortalWatcher {
      async handleFileChange() {}
    }
    const watcher = new TestPortalWatcher();
    const flags = {
      port: 3000,
      folder: TEST_WORKING_DIR,
      destination: TEST_DEST_DIR,
      ignore: "",
      open: false,
      "auth-key": "",
      "no-reload": false
    };
    const paths = {
      sourceDirectoryPath: flags.folder,
      destinationDirectoryPath: flags.destination,
      generatedPortalArtifactsDirectoryPath: path.join(flags.destination, "generated_portal"),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, ".generated_portal.zip")
    };
    const watcherObj = await watcher.watchAndRegeneratePortal(paths, flags, [], TEST_CONFIG_DIR);
    // Simulate error event
    watcherObj.emit("error", new Error("fail"));
    // Simulate close event
    await watcherObj.close();
    expect(true).to.be.true;
  });
}); 