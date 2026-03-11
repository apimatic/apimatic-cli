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
import { MergeSourceTreeAction } from "./resolve-conflicts.js";
import { BuildContext } from "../../types/build-context.js";
import { FileService } from "../../infrastructure/file-service.js";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly portalService: PortalService = new PortalService();
  private readonly fileService: FileService = new FileService();
  private readonly mergeSourceTreeAction: MergeSourceTreeAction = new MergeSourceTreeAction();
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
    skipApplySourceTree: boolean,
    buildSourceTree: boolean
  ): Promise<ActionResult> => {
    if (buildDirectory.isEqual(sdkDirectory)) {
      this.prompts.sameBuildAndSdkDir(buildDirectory);
      return ActionResult.failed();
    }

    const versionedBuildContext = new VersionedBuildContext(buildDirectory);
    if (await versionedBuildContext.exists()) {
      const resolvedDirectory = await versionedBuildContext.getResolvedBuildDirectory();
      if (!resolvedDirectory) {
        this.prompts.versionedBuildEmpty();
        return ActionResult.failed();
      }
      buildDirectory = resolvedDirectory;
      this.prompts.versionedBuild(versionedBuildContext.getRelativePath(resolvedDirectory));
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
        this.prompts.sdkGenerationServiceError(response.error);
        return ActionResult.failed();
      }

      const tempSdkFilePath = await tempContext.save(response.value.sdk);
      const tempSdkSourceTreePath = await tempContext.save(response.value.sdkSourceTree);
      const tempSdkDir = tempDirectory.join("sdk-temp");
      const gitSourceTreeDir = tempSdkDir.join(".git");
      await this.fileService.createDirectoryIfNotExists(tempSdkDir);
      await this.fileService.unzipFile(tempSdkFilePath, tempSdkDir);
      await this.fileService.createDirectoryIfNotExists(gitSourceTreeDir);
      await this.fileService.unzipFile(tempSdkSourceTreePath, gitSourceTreeDir);

      const finalSdk = await this.mergeSourceTreeAction.execute(tempSdkDir, language, buildDirectory, skipApplySourceTree, buildSourceTree);
      if (finalSdk.isFailed()) {
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