import { log } from "@clack/prompts";
import { format as f } from "../format.js";
import { CodeGenerationVersion } from "../../types/sdk/generate.js";

export function warnIfStabilityIgnored(version: CodeGenerationVersion, stabilityWasProvided: boolean) {
  if (stabilityWasProvided && version === CodeGenerationVersion.V3) {
    log.warn(
      `${f.flag("stability")} has no effect with ${f.flag("codegen-version", CodeGenerationVersion.V3)}. ` +
        `The V3 code generator always produces a stable SDK.`
    );
  }
}
