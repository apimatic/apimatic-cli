import * as path from "path";
import fsExtra from "fs-extra";
import { expect } from "chai";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";
import { PortalServeAction } from "../../../src/actions/portal/serve.js";
import { ServeFlags, ServePaths } from "../../../src/types/portal/serve.js";
import { Result } from "../../../src/types/common/result.js";
import { PortalServePrompts } from "../../../src/prompts/portal/serve.js";
import { ServeHandler } from "../../../src/application/portal/serve/serve-handler.js";
import { PortalService } from "../../../src/infrastructure/services/portal-service.js";

describe("PortalServeAction", () => {
  let TEST_WORKING_DIR: string;
  let TEST_DEST_DIR: string;
  let TEST_CONFIG_DIR: string;
  let tmpDirResult: DirectoryResult;

  class TestPrompts extends PortalServePrompts {
    public started: string[] = [];
    public stopped: string[] = [];
    public errors: string[] = [];
    public outros: number[] = [];
    startProgressIndicator(msg: string) { this.started.push(msg); }
    stopProgressIndicator(msg: string) { this.stopped.push(msg); }
    logError(msg: string) { this.errors.push(msg); }
    displayOutroMessage(port: number) { this.outros.push(port); }
  }

  class TestServerService extends ServeHandler {
    public setupResult: Result<string, string> = Result.success("ok");
    public startResult: Result<boolean, string> = Result.success(true);
    async setupServer() { return this.setupResult; }
    async startServer() { return this.startResult; }
  }

  class TestDocsPortalService extends PortalService {
    public generateResult: Result<NodeJS.ReadableStream, string> = Result.success({} as NodeJS.ReadableStream);
    async generateOnPremPortal(_params: any, _configDir: string): Promise<Result<NodeJS.ReadableStream, string>> {
      return this.generateResult;
    }
  }

  class TestPortalServeAction extends PortalServeAction {
    constructor(
      prompts = new TestPrompts(),
      serverService = new TestServerService(),
      docsPortalService = new TestDocsPortalService()
    ) {
      super();
      (this as any).prompts = prompts;
      (this as any).serverService = serverService;
      (this as any).docsPortalService = docsPortalService;
    }
    protected async generatePortal(
      _flags: ServeFlags,
      paths: ServePaths,
      _ignoredPaths: string[],
      configDirectoryPath: string
    ): Promise<Result<string, string>> {
      const docsPortalService = (this as any).docsPortalService as TestDocsPortalService;
      if (await docsPortalService.generateOnPremPortal({}, configDirectoryPath).then((r) => r.isFailed())) {
        return Result.failure(docsPortalService.generateResult.error!);
      }
      await fsExtra.ensureDir(paths.generatedPortalArtifactsDirectoryPath);
      return Result.success(paths.generatedPortalArtifactsDirectoryPath);
    }
    // Helper for tests to access prompts
    getTestPrompts() { return (this as any).prompts as TestPrompts; }
  }

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    TEST_WORKING_DIR = tmpDirResult.path;
    TEST_DEST_DIR = path.join(TEST_WORKING_DIR, "dest");
    TEST_CONFIG_DIR = path.join(TEST_WORKING_DIR, "config");
    await fsExtra.ensureDir(TEST_WORKING_DIR);
    await fsExtra.ensureDir(TEST_DEST_DIR);
    await fsExtra.ensureDir(TEST_CONFIG_DIR);
    await fsExtra.ensureDir(path.join(TEST_WORKING_DIR, "spec"));
    await fsExtra.writeFile(path.join(TEST_WORKING_DIR, "APIMATIC-BUILD.json"), "{}", "utf8");
    await fsExtra.writeFile(path.join(TEST_WORKING_DIR, "spec", "spec.json"), "{}", "utf8");
  });

  afterEach(async () => {
    await tmpDirResult.cleanup();
  });

  function getFlags(overrides: Partial<ServeFlags> = {}): ServeFlags {
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
  function getPaths(flags: ServeFlags): ServePaths {
    return {
      sourceDirectoryPath: flags.folder,
      destinationDirectoryPath: flags.destination,
      generatedPortalArtifactsDirectoryPath: path.join(flags.destination, "generated_portal"),
      generatedPortalArtifactsZipFilePath: path.join(flags.destination, ".generated_portal.zip")
    };
  }

  it("should return success result for valid serve", async () => {
    const action = new TestPortalServeAction();
    const flags = getFlags();
    const paths = getPaths(flags);
    const result = await action.servePortal(flags, paths, TEST_CONFIG_DIR);
    expect(result.isSuccess()).to.be.true;
    expect(result.value).to.include("successfully served");
    expect(await fsExtra.pathExists(paths.generatedPortalArtifactsDirectoryPath)).to.be.true;
    const prompts = action.getTestPrompts();
    expect(prompts.started[0]).to.include("Generating portal");
    expect(prompts.stopped[prompts.stopped.length-1]).to.include("Portal generated successfully");
    expect(prompts.outros[0]).to.equal(flags.port);
  });

  it("should return failure if generatePortal fails", async () => {
    const prompts = new TestPrompts();
    const docsPortalService = new TestDocsPortalService();
    docsPortalService.generateResult = Result.failure("Simulated failure");
    const action = new TestPortalServeAction(prompts, undefined, docsPortalService);
    const flags = getFlags();
    const paths = getPaths(flags);
    const result = await action.servePortal(flags, paths, TEST_CONFIG_DIR);
    expect(result.isFailed()).to.be.true;
    expect(result.error).to.include("Simulated failure");
    expect(action.getTestPrompts().stopped[0]).to.include("There was an error while generating the portal");
  });

  it("should return failure if setupServer fails", async () => {
    const prompts = new TestPrompts();
    const serverService = new TestServerService();
    serverService.setupResult = Result.failure("setup fail");
    const action = new TestPortalServeAction(prompts, serverService);
    const flags = getFlags();
    const paths = getPaths(flags);
    const result = await action.servePortal(flags, paths, TEST_CONFIG_DIR);
    expect(result.isFailed()).to.be.true;
    expect(result.error).to.include("setup fail");
  });

  it("should return failure if startServer fails", async () => {
    const prompts = new TestPrompts();
    const serverService = new TestServerService();
    serverService.startResult = Result.failure("start fail");
    const action = new TestPortalServeAction(prompts, serverService);
    const flags = getFlags();
    const paths = getPaths(flags);
    const result = await action.servePortal(flags, paths, TEST_CONFIG_DIR);
    expect(result.isFailed()).to.be.true;
    expect(result.error).to.include("start fail");
  });

  it("should pass custom auth-key to generatePortalParams", async () => {
    let receivedAuthKey: string|null = null;
    class CustomDocsPortalService extends TestDocsPortalService {
      async generateOnPremPortal(params: any, _configDir: string): Promise<Result<NodeJS.ReadableStream, string>> {
        receivedAuthKey = params.overrideAuthKey;
        return Result.success({} as NodeJS.ReadableStream);
      }
    }
    class CustomAction extends TestPortalServeAction {
      constructor() {
        super(new TestPrompts(), new TestServerService(), new CustomDocsPortalService());
      }
      protected async generatePortal(
        flags: ServeFlags,
        paths: ServePaths,
        _ignoredPaths: string[],
        configDirectoryPath: string
      ): Promise<Result<string, string>> {
        await (this as any).docsPortalService.generateOnPremPortal({ overrideAuthKey: flags["auth-key"] }, configDirectoryPath);
        return Result.success(paths.generatedPortalArtifactsDirectoryPath);
      }
    }
    const action = new CustomAction();
    const flags = getFlags({ "auth-key": "my-key" });
    const paths = getPaths(flags);
    await action.servePortal(flags, paths, TEST_CONFIG_DIR);
    expect(receivedAuthKey).to.equal("my-key");
  });

  it("should create portal in correct location for relative directories", async () => {
    const relSource = "rel-src";
    const relDest = "rel-dest";
    await fsExtra.ensureDir(relSource);
    await fsExtra.ensureDir(relDest);
    await fsExtra.ensureDir(path.join(relSource, "spec"));
    await fsExtra.writeFile(path.join(relSource, "APIMATIC-BUILD.json"), "{}", "utf8");
    await fsExtra.writeFile(path.join(relSource, "spec", "spec.json"), "{}", "utf8");
    const flags = getFlags({ folder: relSource, destination: relDest });
    const paths = getPaths(flags);
    const action = new TestPortalServeAction();
    const result = await action.servePortal(flags, paths, TEST_CONFIG_DIR);
    expect(result.isSuccess()).to.be.true;
    expect(await fsExtra.pathExists(paths.generatedPortalArtifactsDirectoryPath)).to.be.true;
    await fsExtra.remove(relSource);
    await fsExtra.remove(relDest);
  });

  it("should create portal in correct location for absolute directories", async () => {
    const absSource = path.resolve("abs-src");
    const absDest = path.resolve("abs-dest");
    await fsExtra.ensureDir(absSource);
    await fsExtra.ensureDir(absDest);
    await fsExtra.ensureDir(path.join(absSource, "spec"));
    await fsExtra.writeFile(path.join(absSource, "APIMATIC-BUILD.json"), "{}", "utf8");
    await fsExtra.writeFile(path.join(absSource, "spec", "spec.json"), "{}", "utf8");
    const flags = getFlags({ folder: absSource, destination: absDest });
    const paths = getPaths(flags);
    const action = new TestPortalServeAction();
    const result = await action.servePortal(flags, paths, TEST_CONFIG_DIR);
    expect(result.isSuccess()).to.be.true;
    expect(await fsExtra.pathExists(paths.generatedPortalArtifactsDirectoryPath)).to.be.true;
    await fsExtra.remove(absSource);
    await fsExtra.remove(absDest);
  });

  it("should create portal in correct location for current directory as source", async () => {
    const cwd = process.cwd();
    await fsExtra.ensureDir(path.join(cwd, "spec"));
    await fsExtra.writeFile(path.join(cwd, "APIMATIC-BUILD.json"), "{}", "utf8");
    await fsExtra.writeFile(path.join(cwd, "spec", "spec.json"), "{}", "utf8");
    const dest = path.join(TEST_WORKING_DIR, "curdir-dest");
    await fsExtra.ensureDir(dest);
    const flags = getFlags({ folder: ".", destination: dest });
    const paths = getPaths(flags);
    const action = new TestPortalServeAction();
    const result = await action.servePortal(flags, paths, TEST_CONFIG_DIR);
    expect(result.isSuccess()).to.be.true;
    expect(await fsExtra.pathExists(paths.generatedPortalArtifactsDirectoryPath)).to.be.true;
    // Clean up only the generated dir, not the whole cwd
    await fsExtra.remove(path.join(cwd, "generated_portal"));
    await fsExtra.remove(path.join(cwd, "APIMATIC-BUILD.json"));
    await fsExtra.remove(path.join(cwd, "spec"));
    await fsExtra.remove(dest);
  });

  it("should create portal in correct location for current directory as destination", async () => {
    const src = path.join(TEST_WORKING_DIR, "curdir-src");
    await fsExtra.ensureDir(src);
    await fsExtra.ensureDir(path.join(src, "spec"));
    await fsExtra.writeFile(path.join(src, "APIMATIC-BUILD.json"), "{}", "utf8");
    await fsExtra.writeFile(path.join(src, "spec", "spec.json"), "{}", "utf8");
    const flags = getFlags({ folder: src, destination: "." });
    const paths = getPaths(flags);
    const action = new TestPortalServeAction();
    const result = await action.servePortal(flags, paths, TEST_CONFIG_DIR);
    expect(result.isSuccess()).to.be.true;
    expect(await fsExtra.pathExists(paths.generatedPortalArtifactsDirectoryPath)).to.be.true;
    // Clean up only the generated dir
    await fsExtra.remove(path.join(process.cwd(), "generated_portal"));
    await fsExtra.remove(src);
  });
}); 