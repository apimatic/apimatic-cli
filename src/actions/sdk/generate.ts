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
import { FilePath } from "../../types/file/filePath.js";
import { ResolveConflictsAction } from "./resolve-conflicts.js";
import { BuildContext } from "../../types/build-context.js";
import { FileService } from "../../infrastructure/file-service.js";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly portalService: PortalService = new PortalService();
  private readonly fileService: FileService = new FileService();
  private readonly resolveConflictsAction: ResolveConflictsAction = new ResolveConflictsAction();
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
    noCustomization: boolean = false
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(sdkDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    const versionedBuildContext = new VersionedBuildContext(buildDirectory);
    if (await versionedBuildContext.exists()) {
      if (!(await versionedBuildContext.validate())) {
        this.prompts.versionedBuildEmpty();
        return ActionResult.failed();
      }
      buildDirectory = versionedBuildContext.resolvedBuildDirectory;
      this.prompts.versionedBuild(versionedBuildContext.relativePath);
    }

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      this.prompts.srcDirectoryEmpty(buildDirectory);
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

      // TODO: pass build file
      const response = await this.prompts.generateSDK(
        this.portalService.generateSdk(buildZipPath, language, this.configDir, this.commandMetadata, this.authKey)
      );

      // TODO: this should be a service error
      if (response.isErr()) {
        this.prompts.logGenerationError(response.error.errorMessage);
        return ActionResult.failed();
      }

      const tempSdkFilePath = await tempContext.save(response.value);
      const tempSdkDir = tempDirectory.join("sdk-temp");
      await this.fileService.createDirectoryIfNotExists(tempSdkDir);
      await this.fileService.unzipFile(tempSdkFilePath, tempSdkDir);

      const conflictResult = await this.resolveConflictsAction.execute(tempSdkDir, language, buildDirectory, noCustomization);
      if (conflictResult.isFailed()) {
        return ActionResult.failed();
      }

      const finalZipPath = FilePath.create(tempDirectory.join("final-sdk.zip").toString());
      if (!finalZipPath) {
        return ActionResult.failed();
      }

      await this.fileService.zipDirectory(tempSdkDir, finalZipPath);
      const sdkLanguageDirectory = await sdkContext.save(finalZipPath, zipSdk);
      this.prompts.sdkGenerated(sdkLanguageDirectory);

      return ActionResult.success();
    });
  };
}