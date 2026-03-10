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
    apiVersion?: string
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(sdkDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    const versionedBuildContext = new VersionedBuildContext(buildDirectory);
    if (await versionedBuildContext.isVersioned()) {
      const versionDirs = await versionedBuildContext.getVersionDirectories();
      if (versionDirs.length === 0) {
        this.prompts.versionedBuildEmpty(await versionedBuildContext.getVersionsDirectory());
        return ActionResult.failed();
      }

      const resolvedDirectory = versionDirs.length === 1
        ? versionDirs[0]
        : apiVersion
          ? await versionedBuildContext.resolveVersionDirectory(apiVersion)
          : await this.prompts.selectVersion(versionDirs);

      if (!resolvedDirectory) {
        if (apiVersion) this.prompts.versionNotFound();
        return apiVersion ? ActionResult.failed() : ActionResult.cancelled();
      }

      buildDirectory = resolvedDirectory;
      sdkDirectory = sdkDirectory.join(resolvedDirectory.leafName());
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
        this.portalService.generateSdk(buildZipPath, language, this.configDir, this.commandMetadata, this.authKey)
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
