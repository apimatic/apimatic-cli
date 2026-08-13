import { expect } from "chai";
import { formatPublishingDetails } from "../../../../src/prompts/sdk/publish.js";
import { PublishType } from "../../../../src/types/publish-api/publishing-profile-item.js";
import { PublishingProfile } from "../../../../src/types/publish/publishing-profile.js";
import { SemVersion } from "../../../../src/types/publish/version.js";
import { CodeGenerationVersion, Language, Stability } from "../../../../src/types/sdk/generate.js";

const profile = { toString: () => "My Profile" } as unknown as PublishingProfile;
const version = SemVersion.tryCreate("1.2.3")._unsafeUnwrap();

const details = (publishType: PublishType[], codegenVersion?: CodeGenerationVersion, stability?: Stability) =>
  formatPublishingDetails({
    profile,
    language: Language.CSHARP,
    version,
    publishType,
    codegenOption: codegenVersion && stability ? { version: codegenVersion, stability } : undefined
  });

describe("formatPublishingDetails", () => {
  it("renders the profile, language, version and targets", () => {
    const output = details([PublishType.PackagePublishing], CodeGenerationVersion.V3, Stability.STABLE);

    expect(output).to.contain("Profile:   My Profile");
    expect(output).to.contain("Language:  csharp");
    expect(output).to.contain("Version:   1.2.3");
    expect(output).to.contain("Targets:   Package");
  });

  it("omits the generator row when no codegen option is given, leaving pre-existing output unchanged", () => {
    const output = details([PublishType.PackagePublishing]);

    expect(output).to.not.contain("Generator:");
  });

  it("names the generator once it is no longer the default", () => {
    const output = details([PublishType.PackagePublishing], CodeGenerationVersion.V4, Stability.BETA);

    expect(output).to.contain("Generator: V4 (beta)");
  });
});
