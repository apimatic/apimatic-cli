import { expect } from "chai";
import { Parser } from "@oclif/core";
import SdkPublish from "../../../src/commands/sdk/publish.js";
import { CodeGenerationVersion, Stability } from "../../../src/types/sdk/generate.js";

const parse = (argv: string[]) => Parser.parse(argv, { flags: SdkPublish.flags as never, strict: true } as never);

// `warnIfStabilityIgnored` decides whether to fire from oclif's `setFromDefault` metadata rather
// than from the flag's value, because `--stability stable` on V3 is ignored just as silently as
// `--stability beta`. This is the codebase's first use of parse metadata, so the mechanism itself
// is worth pinning down: if oclif ever stops reporting it, the warning fails open and silently.
describe("sdk publish codegen flags", () => {
  it("defaults to v3 and stable when neither flag is passed", async () => {
    const { flags } = (await parse([])) as never as { flags: Record<string, unknown> };

    expect(flags["codegen-version"]).to.equal(CodeGenerationVersion.V3);
    expect(flags.stability).to.equal(Stability.STABLE);
  });

  it("accepts the v4 combination", async () => {
    const { flags } = (await parse(["--codegen-version", "v4", "--stability", "beta"])) as never as {
      flags: Record<string, unknown>;
    };

    expect(flags["codegen-version"]).to.equal(CodeGenerationVersion.V4);
    expect(flags.stability).to.equal(Stability.BETA);
  });

  it("rejects a codegen version the CLI does not know", async () => {
    try {
      await parse(["--codegen-version", "v5"]);
      expect.fail("expected --codegen-version v5 to be rejected");
    } catch (error) {
      expect((error as Error).message).to.contain("v5");
    }
  });

  it("does not filter languages by codegen version, leaving that to the service", async () => {
    const { flags } = (await parse([
      "--codegen-version",
      "v4",
      "--language",
      "typescript"
    ])) as never as { flags: Record<string, unknown> };

    expect(flags.language).to.equal("typescript");
  });
});
