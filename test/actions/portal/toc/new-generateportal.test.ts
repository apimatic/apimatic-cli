import rewiremock from 'rewiremock/node';
import * as path from "path";
import { expect } from "chai";
import { EventEmitter } from "events";
EventEmitter.defaultMaxListeners = 50;
import sinon from "sinon";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";
import { Readable } from "stream";
import { PortalGeneratePrompts } from "../../../../src/prompts/portal/generate.js";
import { Result } from "../../../../src/types/common/result.js";
import type { PortalGenerateAction as PortalGenerateActionType } from "../../../../src/actions/portal/generate.js";
import { PortalService } from "../../../../src/infrastructure/services/portal-service.js";

const extractZipFileStub = sinon.stub().resolves();
const deleteFileStub = sinon.stub().resolves();
const validateAndZipPortalSourceStub = sinon.stub().resolves("fake-zip");
const getGeneratedFilesPathsStub = sinon.stub().returns([]);
const createWriteStreamStub = sinon.stub();

// Rewire the module under test
const { PortalGenerateAction } = rewiremock.proxy(
  "../../../../src/actions/portal/generate.js",
  {
    "../../../../src/utils/utils.js": {
      ...require("../../../../src/utils/utils.js"),
      extractZipFile: extractZipFileStub,
      deleteFile: deleteFileStub,
      validateAndZipPortalSource: validateAndZipPortalSourceStub,
      getGeneratedFilesPaths: getGeneratedFilesPathsStub,
    },
    "fs-extra": {
      ...require("fs-extra"),
      createWriteStream: createWriteStreamStub,
    }
  }
) as { PortalGenerateAction: typeof PortalGenerateActionType };

describe("PortalGenerateAction", () => {
  let tmpDirResult: DirectoryResult;
  let action: PortalGenerateActionType;
  let sandbox: sinon.SinonSandbox;
  let portalServiceStub: Partial<PortalService>;

  beforeEach(async () => {
    //sandbox = sinon.createSandbox();
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    
    // Create portal service stub
    const fakeStream = new Readable();
    fakeStream._read = () => {}; // No-op
    

    portalServiceStub = {
      generateOnPremPortal: async () => Result.success(fakeStream)
    };

    action = new PortalGenerateAction(portalServiceStub as PortalService);
  });

  afterEach(async () => {
    //sandbox.restore();
    await tmpDirResult.cleanup();
    extractZipFileStub.resetHistory();
    deleteFileStub.resetHistory();
    validateAndZipPortalSourceStub.resetHistory();
    getGeneratedFilesPathsStub.resetHistory();
    createWriteStreamStub.resetHistory();
  });

  // Helper to get default params
  function getDefaultParams() {
    const sourceFolderPath = tmpDirResult.path;
    const generatedPortalArtifactsFolderPath = path.join(sourceFolderPath, "out");
    const generatedPortalArtifactsZipFilePath = path.join(sourceFolderPath, "out.zip");
    const destinationFolderPath = path.join(sourceFolderPath, "out");
    // TEMP: Use the provided real zip file path for buildZipPath
    const buildZipPath = "";
    return {
      paths: {
        sourceFolderPath,
        destinationFolderPath,
        generatedPortalArtifactsFolderPath,
        generatedPortalArtifactsZipFilePath,
      },
      flags: {
        zip: false,
        folder: "",        
        destination: "",   
        force: false,     
        "auth-key": ""
      },
      configDir: path.join(sourceFolderPath, "config"),
      buildZipPath // expose for use in the test
    };
  }

  it("should generate portal without zip flag", async () => {
    // Arrange
    const params = getDefaultParams();
  
    // Mock write stream for createWriteStreamStub
    const writeStream = new Readable() as any;
    writeStream.pipe = function () { return this; };
    writeStream.on = function (event: string, cb: () => void) {
      if (event === "finish") setImmediate(cb);
      return this;
    };
    createWriteStreamStub.returns(writeStream);
  
    // Act
    await action.generatePortal(params.paths, params.flags, params.configDir);
  
    // Assert 
    console.log('Checking extractZipFileStub.calledOnce:', extractZipFileStub.calledOnce);
    expect(extractZipFileStub.calledOnce).to.be.true;
    console.log('Checking deleteFileStub.called:', deleteFileStub.called);
    expect(deleteFileStub.called).to.be.true;

  });

  it("should generate portal with zip flag", async () => {
    // Arrange
    const params = getDefaultParams();
    params.flags.zip = true;

    // Mock write stream for createWriteStreamStub
    const writeStream = new Readable() as any;
    writeStream.pipe = function () { return this; };
    writeStream.on = function (event: string, cb: () => void) {
      if (event === "finish") setImmediate(cb);
      return this;
    };
    createWriteStreamStub.returns(writeStream);

    // Act
    await action.generatePortal(params.paths, params.flags, params.configDir);

    // Assert
    expect(extractZipFileStub.notCalled).to.be.true;
    expect(deleteFileStub.called).to.be.true;
    expect(validateAndZipPortalSourceStub.called).to.be.true;
    expect(createWriteStreamStub.called).to.be.true;
  });

  it("should use custom auth key", async () => {
    // Arrange
    const params = getDefaultParams();
    params.flags["auth-key"] = "my-key";
    let receivedParams: any = null;
    // Stub PortalService.generateOnPremPortal to capture params
    const fakeStream = new Readable();
    fakeStream._read = () => {};
    const portalService = {
      generateOnPremPortal: async (p: any) => {
        receivedParams = p;
        return Result.success(fakeStream);
      }
    } as any;
    const actionWithCustomService = new PortalGenerateAction(portalService);
    // Mock write stream
    const writeStream = new Readable() as any;
    writeStream.pipe = function () { return this; };
    writeStream.on = function (event: string, cb: () => void) { if (event === "finish") setImmediate(cb); return this; };
    createWriteStreamStub.returns(writeStream);
    // Act
    await actionWithCustomService.generatePortal(params.paths, params.flags, params.configDir);
    // Assert
    expect(receivedParams.overrideAuthKey).to.equal("my-key");
  });

  it("should handle portal service failure", async () => {
    // Arrange
    const params = getDefaultParams();
    let receivedParams: any = null;
    const portalService = {
      generateOnPremPortal: async (p: any) => {
        receivedParams = p;
        return Result.failure("Failure");
      }
    } as any;
    const actionWithFailService = new PortalGenerateAction(portalService);
    // Spy on error prompt
    const promptsInstance = actionWithFailService.getPromptsForTest();
    const errorSpy = sinon.spy(promptsInstance, "displayPortalGenerationErrorMessage");
    const logErrorSpy = sinon.spy(promptsInstance, "logError");
    // Act
    await actionWithFailService.generatePortal(params.paths, params.flags, params.configDir);
    // Assert
    expect(errorSpy.calledOnce).to.be.true;
    expect(logErrorSpy.calledOnce).to.be.true;
    errorSpy.restore();
    logErrorSpy.restore();
  });
});