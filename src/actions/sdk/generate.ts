import { ZipService } from "../../infrastructure/zip-service.js";
import { FileService } from "../../infrastructure/file-service.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileName } from "../../types/file/fileName.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { SdkContext } from "../../types/sdk-context.js";
import { Platforms } from "@apimatic/sdk";
import { SpecContext } from "../../types/spec-context.js";
import { SdkGeneratePrompts } from "../../prompts/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly zipArchiver: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
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
    specDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    platform: Platforms,
    force: boolean,
    zipSdk: boolean
  ): Promise<ActionResult> => {
    if (specDirectory.isEqual(sdkDirectory)) {
      // return ActionResult.error(`The spec directory and sdk directory cannot be the same: "${specDirectory}"`);
      return ActionResult.failed();
    }

    const specContext = new SpecContext(specDirectory);
    if (!(await specContext.validate())) {
      // return ActionResult.error(`The spec directory is either empty or invalid: "${specDirectory}"`);
      return ActionResult.failed();
    }

    const sdkContext = new SdkContext(sdkDirectory, platform);
    if (!force && (await sdkContext.exists()) && !(await this.prompts.overwriteSdk(sdkDirectory))) {
      // return ActionResult.error(
      //   "Please enter a different destination folder or remove the existing files and try again."
      // );
      return ActionResult.failed();
    }

    return await withDirPath(async (tempDirectory) => {
      this.prompts.displaySdkGenerationMessage();

      const specZipPath = new FilePath(tempDirectory, new FileName("spec.zip"));
      await this.zipArchiver.archive(specDirectory, specZipPath);

      const response = await this.portalService.generateSdk(
        specZipPath,
        platform,
        this.configDir,
        this.commandMetadata,
        this.authKey
      );

      if (response.isErr()) {
        this.prompts.displaySdkGenerationErrorMessage();
       // return ActionResult.error(response.error!);
        return ActionResult.failed();
      }

      const tempSdkFilePath = new FilePath(tempDirectory, new FileName("sdk.zip"));
      await this.fileService.writeFile(tempSdkFilePath, response.value);

      await sdkContext.save(tempSdkFilePath, zipSdk);
      this.prompts.displaySdkGenerationSuccessMessage();

      return ActionResult.success();
    });
  };
}
