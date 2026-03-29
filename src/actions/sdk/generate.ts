import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { SdkContext } from "../../types/sdk-context.js";
import { VersionedBuildContext } from "../../types/versioned-build-context.js";
import { SdkGeneratePrompts } from "../../prompts/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { TempContext } from "../../types/temp-context.js";
import { Language } from "../../types/sdk/generate.js";
import { SpecContext } from "../../types/spec-context.js";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly portalService: PortalService = new PortalService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    buildDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    language: Language,
    force: boolean,
    zipSdk: boolean,
    apiVersion?: string,
    packageVersion: string | undefined = undefined,
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(sdkDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    const versionedBuildContext = new VersionedBuildContext(buildDirectory);
    const versionedBuildResult = await versionedBuildContext.validate();
    if (versionedBuildResult.isValid) {
      if (versionedBuildResult.versions.length === 0) {
        this.prompts.versionedBuildEmpty(versionedBuildResult.versionsDirectory);
        return ActionResult.failed();
      }

      let version: string;
      if (apiVersion) {
        if (!versionedBuildResult.versions.includes(apiVersion)) {
          this.prompts.versionNotFound();
          return ActionResult.failed();
        }
        version = apiVersion;
      } else if (versionedBuildResult.versions.length === 1) {
        version = versionedBuildResult.versions[0];
      } else {
        const selectedVersion = await this.prompts.selectVersion(versionedBuildResult.versions);
        if (!selectedVersion) {
          return ActionResult.cancelled();
        }
        version = selectedVersion;
      }

      buildDirectory = versionedBuildResult.versionsDirectory.join(version);
      sdkDirectory = sdkDirectory.join(version);
    }

    const specDirectory = buildDirectory.join("spec");
    const specContext = new SpecContext(specDirectory);
    if (!(await specContext.validate())) {
      this.prompts.specDirectoryEmpty(specDirectory);
      return ActionResult.failed();
    }

    const sdkContext = new SdkContext(sdkDirectory, language);
    if (!force && (await sdkContext.exists()) && !(await this.prompts.overwriteSdk(sdkContext.sdkLanguageDirectory))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const buildZipPath = await tempContext.zip(buildDirectory);

      const response = await this.prompts.generateSDK(
        this.portalService.generateSdk(buildZipPath, language, this.configDir, this.commandMetadata, this.authKey, packageVersion)
      );

      // TODO: this should be service error
      if (response.isErr()) {
        this.prompts.sdkGenerationServiceError(response.error);
        return ActionResult.failed();
      }

      const tempSdkFilePath = await tempContext.save(response.value);
      const sdkLanguageDirectory = await sdkContext.save(tempSdkFilePath, zipSdk);

      this.prompts.sdkGenerated(sdkLanguageDirectory);

      return ActionResult.success();
    });
  };
}
