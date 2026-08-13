import { expect } from "chai";
import sinon from "sinon";
import { log } from "@clack/prompts";
import { warnIfStabilityIgnored } from "../../../src/prompts/sdk/stability.js";
import { CodeGenerationVersion } from "../../../src/types/sdk/generate.js";

describe("warnIfStabilityIgnored", () => {
  let warn: sinon.SinonStub;

  beforeEach(() => {
    warn = sinon.stub(log, "warn");
  });

  afterEach(() => {
    warn.restore();
  });

  it("warns when the flag was typed alongside codegen version v3", () => {
    warnIfStabilityIgnored(CodeGenerationVersion.V3, true);

    expect(warn.calledOnce).to.equal(true);
  });

  it("stays silent when the flag was only filled in from its default", () => {
    warnIfStabilityIgnored(CodeGenerationVersion.V3, false);

    expect(warn.called).to.equal(false);
  });

  it("stays silent on v4, where stability reaches the generation service", () => {
    warnIfStabilityIgnored(CodeGenerationVersion.V4, true);

    expect(warn.called).to.equal(false);
  });
});
