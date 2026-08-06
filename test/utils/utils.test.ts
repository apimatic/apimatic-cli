import { Readable } from "stream";
import { expect } from "chai";
import { discardStreamBody } from "../../src/utils/utils.js";

// `ApiError.body` is `string | Blob | NodeJS.ReadableStream`, and which one it
// is depends on the endpoint: `callAsStream` yields a stream on Node, a Blob
// elsewhere, and `callAsJson` yields a string. `discardStreamBody` has to
// release the first without disturbing the others, so the probe is the contract.
describe("discardStreamBody", () => {
  it("destroys a readable stream body", () => {
    const stream = Readable.from(["chunk"]);
    expect(stream.destroyed).to.be.false;

    discardStreamBody(stream);

    expect(stream.destroyed).to.be.true;
  });

  it("is idempotent on an already destroyed stream", () => {
    // The SDK drains error bodies itself via `loadResult` on the `throwOn` path,
    // so a body reaching here may already be finished.
    const stream = Readable.from(["chunk"]);
    stream.destroy();

    expect(() => discardStreamBody(stream)).to.not.throw();
    expect(stream.destroyed).to.be.true;
  });

  it("leaves a string body intact for callers that parse it afterwards", () => {
    // `transformation-service` discards before reading the 401 message; that is
    // only safe because a `callAsJson` string body has no `destroy`.
    const body = JSON.stringify({ message: "Authorization has been denied" });

    discardStreamBody(body);

    expect((JSON.parse(body) as { message: string }).message).to.equal("Authorization has been denied");
  });

  it("ignores a Blob-like body with no destroy method", () => {
    expect(() => discardStreamBody({ size: 12, type: "application/zip" })).to.not.throw();
  });

  it("ignores undefined and null bodies", () => {
    expect(() => discardStreamBody(undefined)).to.not.throw();
    expect(() => discardStreamBody(null)).to.not.throw();
  });

  it("ignores a destroy property that is not callable", () => {
    expect(() => discardStreamBody({ destroy: "not a function" })).to.not.throw();
  });
});
