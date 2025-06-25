import * as path from "path";
import fsExtra from "fs-extra";
import { expect } from "chai";
import { SdlParser } from "../../../../../src/application/portal/toc/sdl-parser.js";
import { PortalService } from "../../../../../src/infrastructure/services/portal-service.js";
import { Result } from "../../../../../src/types/common/result.js";
import { Sdl } from "../../../../../src/types/sdl/sdl.js";
import { dir as tmpDir, DirectoryResult } from "tmp-promise";

describe("SdlParser", () => {
  let TEST_CONFIG_DIR: string;
  let TEST_SPEC_DIR: string;
  let tmpDirResult: DirectoryResult;
  let sdlParser: SdlParser;
  let portalServiceStub: Partial<PortalService>;

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    TEST_CONFIG_DIR = tmpDirResult.path;
    TEST_SPEC_DIR = path.join(TEST_CONFIG_DIR, "spec");
    await fsExtra.ensureDir(TEST_SPEC_DIR);

    const sdlContent: Sdl = {
      Endpoints: [
        {
          Name: "Login",
          Group: "Authentication"
        },
        {
          Name: "Logout",
          Group: "Authentication"
        },
        {
          Name: "GetProducts",
          Group: "Products"
        }
      ],
      CustomTypes: [
        {
          Name: "User"
        },
        {
          Name: "Product"
        }
      ]
    };
    await fsExtra.writeJson(path.join(TEST_SPEC_DIR, "sdl.json"), sdlContent);

    portalServiceStub = {
      generateSdl: async () => Result.success(sdlContent)
    };

    sdlParser = new SdlParser(portalServiceStub as PortalService);
  });

  afterEach(async () => {
    await tmpDirResult.cleanup();
  });

  describe("getTocComponentsFromSdl", () => {
    it("should extract endpoint groups correctly", async () => {
      const result = await sdlParser.getTocComponentsFromSdl(TEST_SPEC_DIR, TEST_SPEC_DIR, TEST_CONFIG_DIR);

      expect(result.isSuccess()).to.be.true;
      const { endpointGroups } = result.value!;

      const authEndpoints = endpointGroups.get("Authentication");
      expect(authEndpoints).to.have.lengthOf(2);
      expect(authEndpoints![0]).to.deep.include({
        generate: null,
        from: "endpoint",
        endpointName: "Login",
        endpointGroup: "Authentication"
      });
      expect(authEndpoints![1]).to.deep.include({
        generate: null,
        from: "endpoint",
        endpointName: "Logout",
        endpointGroup: "Authentication"
      });

      const productEndpoints = endpointGroups.get("Products");
      expect(productEndpoints).to.have.lengthOf(1);
      expect(productEndpoints![0]).to.deep.include({
        generate: null,
        from: "endpoint",
        endpointName: "GetProducts",
        endpointGroup: "Products"
      });
    });

    it("should extract models correctly", async () => {
      const result = await sdlParser.getTocComponentsFromSdl(TEST_SPEC_DIR, TEST_SPEC_DIR, TEST_CONFIG_DIR);

      expect(result.isSuccess()).to.be.true;
      const { models } = result.value!;

      expect(models).to.have.lengthOf(2);
      expect(models[0]).to.deep.include({
        generate: null,
        from: "model",
        modelName: "User"
      });
      expect(models[1]).to.deep.include({
        generate: null,
        from: "model",
        modelName: "Product"
      });
    });

    it("should handle empty SDL", async () => {
      const emptySdl: Sdl = {
        Endpoints: [],
        CustomTypes: []
      };
      portalServiceStub.generateSdl = async () => Result.success(emptySdl);

      const result = await sdlParser.getTocComponentsFromSdl(TEST_SPEC_DIR, TEST_SPEC_DIR, TEST_CONFIG_DIR);

      expect(result.isSuccess()).to.be.true;
      const { endpointGroups, models } = result.value!;
      expect(endpointGroups.size).to.equal(0);
      expect(models).to.have.lengthOf(0);
    });

    it("should handle malformed SDL", async () => {
      portalServiceStub.generateSdl = async () => Result.failure("Invalid SDL");

      const result = await sdlParser.getTocComponentsFromSdl(TEST_SPEC_DIR, TEST_SPEC_DIR, TEST_CONFIG_DIR);

      expect(result.isSuccess()).to.be.false;
      expect(result.error).to.equal(
        "Failed to extract endpoints/models from the specification. Please validate your spec using APIMatic's interactive VS Code extension"
      );
    });

    it("should maintain endpoint group ordering", async () => {
      const result = await sdlParser.getTocComponentsFromSdl(TEST_SPEC_DIR, TEST_SPEC_DIR, TEST_CONFIG_DIR);

      expect(result.isSuccess()).to.be.true;
      const { endpointGroups } = result.value!;
      const groupNames = Array.from(endpointGroups.keys());
      expect(groupNames).to.deep.equal(["Authentication", "Products"]);
    });
  });
});