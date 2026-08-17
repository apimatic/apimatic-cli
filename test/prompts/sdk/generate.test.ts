import { expect } from "chai";
import sinon from "sinon";
import { log } from "@clack/prompts";
import { SdkGeneratePrompts } from "../../../src/prompts/sdk/generate.js";
import { CodeGenerationVersion, CodegenOption, Stability } from "../../../src/types/sdk/generate.js";

const v4 = CodegenOption.create(CodeGenerationVersion.V4, Stability.BETA);

describe("SdkGeneratePrompts.warnIfStabilityIgnored", () => {
  const prompts = new SdkGeneratePrompts();
  let warn: sinon.SinonStub;

  beforeEach(() => {
    warn = sinon.stub(log, "warn");
  });

  afterEach(() => {
    warn.restore();
  });

  it("warns when the flag was typed alongside codegen version v3", () => {
    prompts.warnIfStabilityIgnored(CodegenOption.v3, true);

    expect(warn.calledOnce).to.equal(true);
  });

  it("stays silent when the flag was only filled in from its default", () => {
    prompts.warnIfStabilityIgnored(CodegenOption.v3, false);

    expect(warn.called).to.equal(false);
  });

  it("stays silent on v4, where stability reaches the generation service", () => {
    prompts.warnIfStabilityIgnored(v4, true);

    expect(warn.called).to.equal(false);
  });
});
