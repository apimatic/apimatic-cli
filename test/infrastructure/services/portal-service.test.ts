import { expect } from "chai";
import http from "node:http";
import { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { Status } from "@apimatic/sdk";
import { PortalService } from "../../../src/infrastructure/services/portal-service";
import { DirectoryPath } from "../../../src/types/file/directoryPath";
import { FilePath } from "../../../src/types/file/filePath";
import { Language, Stability } from "../../../src/types/sdk/generate";
import { ServiceError, ServiceErrorCode } from "../../../src/infrastructure/service-error";
import { envInfo } from "../../../src/infrastructure/env-info";

describe("PortalService generation status polling", () => {
  const GENERATION_ID = "11111111-2222-3333-4444-555555555555";
  const AUTH_KEY = "test-auth-key";
  const metadata = { commandName: "portal generate", shell: "bash" };

  let server: http.Server;
  let workDir: string;
  let buildPath: FilePath;
  let configDir: DirectoryPath;
  let service: PortalService;
  let respondToStatus: (res: http.ServerResponse, attempt: number) => void;
  const statusRequests: { url: string; headers: http.IncomingHttpHeaders }[] = [];

  const json = (res: http.ServerResponse, statusCode: number, body: unknown) => {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  // The API redirects to the download location on completion rather than
  // reporting a Completed status body.
  const redirectToDownload = (res: http.ServerResponse) => {
    res.writeHead(302, { Location: `/${GENERATION_ID}/download` });
    res.end();
  };

  const statusBody = (body: unknown) => (res: http.ServerResponse) => json(res, 200, body);

  const drain = async (stream: NodeJS.ReadableStream) => {
    let size = 0;
    for await (const chunk of stream) size += chunk.length;
    return size;
  };

  before(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "";

      if (req.method === "POST") {
        req.resume();
        req.on("end", () =>
          json(res, 202, {
            id: GENERATION_ID,
            links: {
              status: `${url}/${GENERATION_ID}/status`,
              download: `${url}/${GENERATION_ID}/download`
            }
          })
        );
        return;
      }

      if (url.endsWith("/status")) {
        statusRequests.push({ url, headers: req.headers });
        respondToStatus(res, statusRequests.length);
        return;
      }

      if (url.endsWith("/download")) {
        res.writeHead(200, { "Content-Type": "application/zip" });
        res.end(Buffer.from("PK generated-artifact"));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    process.env.APIMATIC_BASE_URL = `http://127.0.0.1:${port}`;

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-service-"));
    const buildFile = path.join(workDir, "build.zip");
    fs.writeFileSync(buildFile, Buffer.from("PK build-input"));
    buildPath = FilePath.create(buildFile)!;
    // No config.json here, so the explicit authKey is used.
    configDir = new DirectoryPath(workDir);
    service = new PortalService();
  });

  after(async () => {
    delete process.env.APIMATIC_BASE_URL;
    (envInfo.constructor as unknown as { cachedBaseUrl?: string }).cachedBaseUrl = undefined;
    fs.rmSync(workDir, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    statusRequests.length = 0;
  });

  const generatePortal = () => service.generatePortal(buildPath, configDir, metadata, AUTH_KEY);
  const errorFrom = (result: { _unsafeUnwrapErr(): unknown }) => result._unsafeUnwrapErr() as ServiceError;

  describe("generatePortal", () => {
    it("polls the portal status path, authenticated, and downloads once complete", async () => {
      respondToStatus = (res) => redirectToDownload(res);

      const result = await generatePortal();

      expect(result.isOk(), "generation should succeed").to.be.true;
      expect(await drain(result._unsafeUnwrap() as NodeJS.ReadableStream)).to.be.greaterThan(0);
      expect(statusRequests.map((request) => request.url)).to.deep.equal([`/portal/v2/${GENERATION_ID}/status`]);
      expect(statusRequests[0].headers.authorization).to.equal(`X-Auth-Key ${AUTH_KEY}`);
      expect(statusRequests[0].headers.accept).to.equal("application/json");
    });

    it("keeps polling while the API reports InProgress", async () => {
      respondToStatus = (res, attempt) =>
        attempt < 3 ? json(res, 200, { status: Status.InProgress }) : redirectToDownload(res);

      const result = await generatePortal();

      expect(result.isOk()).to.be.true;
      await drain(result._unsafeUnwrap() as NodeJS.ReadableStream);
      expect(statusRequests).to.have.lengthOf(3);
    });

    it("maps a Failed status onto a server error", async () => {
      respondToStatus = statusBody({ status: Status.Failed });

      const result = await generatePortal();

      expect(errorFrom(result).code).to.equal(ServiceErrorCode.ServerError);
    });

    it("lists every validation error message rather than only the first", async () => {
      // Payload shape taken from the dev API for a build file that misconfigures
      // several languages. Java fails three separate package-setting rules.
      respondToStatus = statusBody({
        status: Status.ValidationError,
        errors: {
          "generatePortal.languageConfig[1].value.PackageSettings": [
            'No package settings found for the package repository "NuGet" in language "csharp".'
          ],
          "generatePortal.languageConfig[2].value.PackageSettings": [
            'No package settings found for the package repository "Npm" in language "typescript".'
          ],
          "generatePortal.languageConfig[0].value.PackageSettings": [
            'The value for required package setting "GroupId" is missing for language "java".',
            'The value for required package setting "Version" is missing for language "java".',
            'The value for required package setting "PackageName" is missing for language "java".'
          ]
        }
      });

      const result = await generatePortal();
      const error = errorFrom(result);

      expect(error.code).to.equal(ServiceErrorCode.BadRequest);
      expect(error.errorMessage).to.equal(
        "One or more validation errors occurred." +
          '\n- No package settings found for the package repository "NuGet" in language "csharp".' +
          '\n- No package settings found for the package repository "Npm" in language "typescript".' +
          '\n- The value for required package setting "GroupId" is missing for language "java".' +
          '\n- The value for required package setting "Version" is missing for language "java".' +
          '\n- The value for required package setting "PackageName" is missing for language "java".'
      );
      expect(error.getError("generatePortal.languageConfig[0].value.PackageSettings")).to.have.lengthOf(3);
    });

    it("handles the empty-string error key portal generation uses", async () => {
      respondToStatus = statusBody({
        status: Status.ValidationError,
        errors: { "": ["No build tasks provided. Both generatePortal and generateVersionedPortal are null"] }
      });

      const result = await generatePortal();
      const error = errorFrom(result);

      expect(error.errorMessage).to.equal(
        "One or more validation errors occurred." +
          "\n- No build tasks provided. Both generatePortal and generateVersionedPortal are null"
      );
      expect(error.getError("")).to.have.lengthOf(1);
    });

    it("terminates on a validation error that carries no messages", async () => {
      respondToStatus = statusBody({ status: Status.ValidationError });

      const result = await generatePortal();

      expect(errorFrom(result).errorMessage).to.equal("One or more validation errors occurred.");
      expect(statusRequests, "must not keep polling after a terminal state").to.have.lengthOf(1);
    });

    it("reports a subscription error with the first message", async () => {
      respondToStatus = statusBody({
        status: Status.SubscriptionError,
        errors: { plan: ["Your plan does not allow portal generation.", "Upgrade to continue."] }
      });

      const result = await generatePortal();
      const error = errorFrom(result);

      expect(error.code).to.equal(ServiceErrorCode.Forbidden);
      expect(error.errorMessage).to.equal(
        "Access denied to resource.\n- Your plan does not allow portal generation."
      );
    });

    it("omits the bullet when a subscription error carries no messages", async () => {
      respondToStatus = statusBody({ status: Status.SubscriptionError });

      const result = await generatePortal();

      expect(errorFrom(result).errorMessage).to.equal("Access denied to resource.");
    });

    // validateStatus keeps axios from throwing, so getGenerationStatus classifies
    // these itself instead of relying on the catch block.
    const statusCodeCases: [string, number, ServiceErrorCode][] = [
      ["an expired auth key", 401, ServiceErrorCode.UnAuthorized],
      ["an unknown endpoint path", 404, ServiceErrorCode.NotFound],
      ["a server failure", 500, ServiceErrorCode.ServerError],
      ["an unmapped status code", 418, ServiceErrorCode.InvalidResponse]
    ];

    statusCodeCases.forEach(([name, statusCode, expectedCode]) => {
      it(`stops polling and reports ${name} (${statusCode})`, async () => {
        respondToStatus = (res) => json(res, statusCode, {});

        const result = await generatePortal();

        expect(errorFrom(result).code).to.equal(expectedCode);
        expect(statusRequests).to.have.lengthOf(1);
      });
    });
  });

  describe("generateSdk", () => {
    const generateSdk = () =>
      service.generateSdk(buildPath, Language.TYPESCRIPT, configDir, metadata, AUTH_KEY);

    it("polls the sdk status path and downloads both artifacts once complete", async () => {
      respondToStatus = (res) => redirectToDownload(res);

      const result = await generateSdk();

      expect(result.isOk(), "generation should succeed").to.be.true;
      const { sdk, sdkSourceTree } = result._unsafeUnwrap();
      expect(await drain(sdk)).to.be.greaterThan(0);
      expect(await drain(sdkSourceTree)).to.be.greaterThan(0);
      expect(statusRequests.map((request) => request.url)).to.deep.equal([`/sdk/${GENERATION_ID}/status`]);
    });

    it("reports sdk merge conflicts with their own wording", async () => {
      respondToStatus = statusBody({
        status: Status.ValidationError,
        errors: { sdkMergeFailed: ["java", "python"] }
      });

      const result = await generateSdk();

      expect(errorFrom(result).errorMessage).to.equal(
        "SDK generation failed for these languages due to merge conflict.\n- java\n- python"
      );
    });

    it("passes through the HTML sdk generation embeds in messages", async () => {
      const message =
        "Main API definition file could not be identified as provided file(s) are either invalid or are in an " +
        'unrecognized/unsupported format.  (<a href="https://docs.apimatic.io/rulesets/input-file-validation/' +
        'main-file-known-format" target="_blank" rel="nofollow">View Details</a>)<br/><b>Error</b>: ' +
        "<i><code>Directory does not contain any valid API description file.</code></i>. ";
      respondToStatus = statusBody({ status: Status.ValidationError, errors: { importSummary: [message] } });

      const result = await generateSdk();

      expect(errorFrom(result).errorMessage).to.equal("One or more validation errors occurred.\n- " + message);
    });
  });

  describe("generateV4Sdk", () => {
    it("polls the v4 sdk status path and downloads once complete", async () => {
      respondToStatus = (res) => redirectToDownload(res);

      const result = await service.generateV4Sdk(
        buildPath,
        Language.CSHARP,
        Stability.BETA,
        configDir,
        metadata,
        AUTH_KEY
      );

      expect(result.isOk(), "generation should succeed").to.be.true;
      expect(await drain(result._unsafeUnwrap() as NodeJS.ReadableStream)).to.be.greaterThan(0);
      expect(statusRequests.map((request) => request.url)).to.deep.equal([`/sdk/v2/${GENERATION_ID}/status`]);
    });
  });
});
