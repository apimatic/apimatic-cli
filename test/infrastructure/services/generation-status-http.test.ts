import { expect } from "chai";
import http from "node:http";
import { AddressInfo } from "node:net";
import { Status } from "@apimatic/sdk";
import { ApiService } from "../../../src/infrastructure/services/api-service";
import { GenerationStatusPoller } from "../../../src/infrastructure/services/generation-status-poller";
import { GenerationStatusEndpoint } from "../../../src/types/api/generation-status-endpoint";
import { DirectoryPath } from "../../../src/types/file/directoryPath";
import { ServiceErrorCode } from "../../../src/infrastructure/service-error";
import { envInfo } from "../../../src/infrastructure/env-info";

/**
 * Exercises status polling against a real local HTTP server rather than a stub,
 * so URL construction, headers, redirect handling and the poll loop are all
 * covered end to end. A stubbed fetcher cannot catch a wrong request path.
 */
describe("generation status polling over HTTP", () => {
  const AUTH_KEY = "test-auth-key";
  const REQUEST_ID = "abc123";
  // No credentials file here — ApiService falls back to the explicit authKey.
  const configDir = new DirectoryPath("./does-not-exist");

  let server: http.Server;
  let respond: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  const observed: { url: string; headers: http.IncomingHttpHeaders }[] = [];

  const json = (res: http.ServerResponse, statusCode: number, body: unknown) => {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  before(async () => {
    server = http.createServer((req, res) => {
      observed.push({ url: req.url ?? "", headers: req.headers });
      respond(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    process.env.APIMATIC_BASE_URL = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    delete process.env.APIMATIC_BASE_URL;
    // envInfo memoises the base URL on the class; clear it so later tests are unaffected.
    (envInfo.constructor as unknown as { cachedBaseUrl?: string }).cachedBaseUrl = undefined;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  beforeEach(() => {
    observed.length = 0;
  });

  const apiService = new ApiService();
  const fetchStatus = (endpoint: GenerationStatusEndpoint) =>
    apiService.getGenerationStatus(endpoint, REQUEST_ID, configDir, "bash", AUTH_KEY);

  const endpointPaths: [string, GenerationStatusEndpoint, string][] = [
    ["portal", GenerationStatusEndpoint.Portal, `/portal/v2/${REQUEST_ID}/status`],
    ["sdk", GenerationStatusEndpoint.Sdk, `/sdk/${REQUEST_ID}/status`],
    ["v4 sdk", GenerationStatusEndpoint.V4Sdk, `/sdk/v2/${REQUEST_ID}/status`]
  ];

  endpointPaths.forEach(([name, endpoint, expectedPath]) => {
    it(`requests the documented status path for ${name}`, async () => {
      respond = (_req, res) => json(res, 200, { status: Status.Completed });

      const result = await fetchStatus(endpoint);

      expect(result.isOk(), "request should succeed").to.be.true;
      expect(observed.map((request) => request.url)).to.deep.equal([expectedPath]);
    });
  });

  it("authenticates with the auth key and asks for JSON", async () => {
    respond = (_req, res) => json(res, 200, { status: Status.Completed });

    await fetchStatus(GenerationStatusEndpoint.Portal);

    expect(observed[0].headers.authorization).to.equal(`X-Auth-Key ${AUTH_KEY}`);
    expect(observed[0].headers.accept).to.equal("application/json");
  });

  it("treats a 302 as completion without following the redirect", async () => {
    respond = (_req, res) => {
      res.writeHead(302, { Location: "/portal/v2/abc123/download" });
      res.end();
    };

    const result = await fetchStatus(GenerationStatusEndpoint.Portal);

    expect(result._unsafeUnwrap().status).to.equal(Status.Completed);
    expect(observed, "redirect must not be followed").to.have.lengthOf(1);
  });

  it("polls until the API reports completion", async () => {
    const script = [Status.InProgress, Status.InProgress, Status.Completed];
    let call = 0;
    respond = (_req, res) => json(res, 200, { status: script[call++] });

    const result = await new GenerationStatusPoller(5).pollUntilCompleted(() =>
      fetchStatus(GenerationStatusEndpoint.Sdk)
    );

    expect(result._unsafeUnwrap().status).to.equal(Status.Completed);
    expect(observed).to.have.lengthOf(3);
  });

  it("stops polling and reports validation errors from the payload", async () => {
    respond = (_req, res) =>
      json(res, 200, { status: Status.ValidationError, errors: { spec: ["Bad spec", "Also bad"] } });

    const result = await new GenerationStatusPoller(5).pollUntilCompleted(() =>
      fetchStatus(GenerationStatusEndpoint.V4Sdk)
    );
    const error = result._unsafeUnwrapErr();

    expect(error.code).to.equal(ServiceErrorCode.BadRequest);
    expect(error.errorMessage).to.equal("One or more validation errors occurred.\n- Bad spec\n- Also bad");
    expect(observed, "must not keep polling after a terminal state").to.have.lengthOf(1);
  });

  // `validateStatus: () => true` keeps axios from throwing, so non-2xx/302 codes
  // never reach handleServiceError and all collapse to InvalidResponse. Pinned
  // here because it means an auth key that expires mid-poll reports a generic
  // error rather than "Unauthorized".
  it("stops polling on an unexpected status code", async () => {
    respond = (_req, res) => json(res, 401, {});

    const result = await new GenerationStatusPoller(5).pollUntilCompleted(() =>
      fetchStatus(GenerationStatusEndpoint.Portal)
    );

    expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.InvalidResponse);
    expect(observed).to.have.lengthOf(1);
  });
});
