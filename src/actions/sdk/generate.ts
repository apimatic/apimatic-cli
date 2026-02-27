import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { SdkContext } from "../../types/sdk-context.js";
import { SpecContext } from "../../types/spec-context.js";
import { SdkGeneratePrompts } from "../../prompts/sdk/generate.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { TempContext } from "../../types/temp-context.js";
import { Language } from "../../types/sdk/generate.js";
import { FileService } from "../../infrastructure/file-service.js";
import { FilePath } from "../../types/file/filePath.js";
import { ResolveConflictsAction } from "./resolve-conflicts.js";

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
    specDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    language: Language,
    force: boolean,
    zipSdk: boolean,
    inputDirectory?: DirectoryPath,
    noCustomization: boolean = false
  ): Promise<ActionResult> => {
    if (specDirectory.isEqual(sdkDirectory)) {
      this.prompts.sameSpecAndSdkDir(specDirectory);
      return ActionResult.failed();
    }

    const specContext = new SpecContext(specDirectory);
    if (!(await specContext.validate())) {
      this.prompts.invalidSpecDirectory(specDirectory);
      return ActionResult.failed();
    }

    const sdkContext = new SdkContext(sdkDirectory, language);
    if (!force && (await sdkContext.exists()) && !(await this.prompts.overwriteSdk(sdkContext.sdkLanguageDirectory))) {
      this.prompts.destinationDirNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);

      // TODO: remove input dir from the condition
      if (noCustomization && inputDirectory) {
        await this.removeCustomizations(inputDirectory);
      }

      const specZipPath = await tempContext.zip(specDirectory);

      // TODO: pass build file
      const response = await this.prompts.generateSDK(
        this.portalService.generateSdk(specZipPath, language, this.configDir, this.commandMetadata, this.authKey)
      );

      // TODO: this should be a service error
      if (response.isErr()) {
        this.prompts.logGenerationError(response.error);
        return ActionResult.failed();
      }

      const tempSdkFilePath = await tempContext.save(response.value);
      const tempSdkDir = tempDirectory.join("sdk-temp");
      await this.fileService.createDirectoryIfNotExists(tempSdkDir);
      await this.fileService.unzipFile(tempSdkFilePath, tempSdkDir);

      // TOTO: remove this condition for input dir
      if (inputDirectory) {
        const conflictResult = await this.resolveConflictsAction.execute(tempSdkDir, language, inputDirectory, noCustomization);
        if (conflictResult.isFailed()) {
          return ActionResult.failed();
        }
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

  private readonly removeCustomizations = async (inputDirectory: DirectoryPath): Promise<void> => {
    const customizationsDir = inputDirectory.join("src").join("customizations");
    if (await this.fileService.directoryExists(customizationsDir)) {
      await this.fileService.deleteDirectory(customizationsDir);
    }
  };
}