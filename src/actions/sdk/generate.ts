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
import { LanguagePlatform } from "../../types/sdk/generate.js";

export class GenerateAction {
  private readonly prompts: SdkGeneratePrompts = new SdkGeneratePrompts();
  private readonly zipArchiver: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalService: PortalService = new PortalService();
  private readonly configDir: DirectoryPath;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, authKey: string | null = null) {
    this.configDir = configDir;
    this.authKey = authKey;
  }

  public readonly execute = async (
    specDirectory: DirectoryPath,
    sdkDirectory: DirectoryPath,
    platform: LanguagePlatform,
    commandName: string,
    force: boolean,
    zipSdk: boolean
  ): Promise<ActionResult> => {
    if (specDirectory.isEqual(sdkDirectory)) {
      return ActionResult.error(`The spec directory and sdk directory cannot be the same: "${specDirectory}"`);
    }

    const specContext = new SpecContext(specDirectory);
    if (!(await specContext.validate())) {
      return ActionResult.error(`Unable to locate a valid "src" directory. Navigate to the directory containing your APIMatic Portal source or set up a new project by running apimatic portal:quickstart.`);
    }

    const sdkContext = new SdkContext(sdkDirectory, platform);
    if (!force && (await sdkContext.exists()) && !(await this.prompts.overwriteSdk(sdkDirectory))) {
      return ActionResult.error(
        "Please enter a different destination folder or remove the existing files and try again."
      );
    }

    return await withDirPath(async (tempDirectory) => {
      this.prompts.displaySdkGenerationMessage();

      const specZipPath = new FilePath(tempDirectory, new FileName("spec.zip"));
      await this.zipArchiver.archive(specDirectory, specZipPath);

      const sdkPlatform = this.convertSimplePlatformToPlatform(platform as LanguagePlatform);
      const response = await this.portalService.generateSdk(specZipPath, sdkPlatform, this.configDir, commandName, this.authKey);

      if (!response.isSuccess()) {
        this.prompts.displaySdkGenerationErrorMessage();
        return ActionResult.error(response.error!);
      }

      const tempSdkFilePath = new FilePath(tempDirectory, new FileName("sdk.zip"));
      await this.fileService.writeFile(tempSdkFilePath, <NodeJS.ReadableStream>response.value);

      await sdkContext.save(tempSdkFilePath, zipSdk);
      this.prompts.displaySdkGenerationSuccessMessage();

      return ActionResult.success();
    });
  };

  private convertSimplePlatformToPlatform(languagePlatform: LanguagePlatform): Platforms {
    switch (languagePlatform) {
      case LanguagePlatform.CSHARP:
        return Platforms.CsNetStandardLib;
      case LanguagePlatform.JAVA:
        return Platforms.JavaEclipseJreLib;
      case LanguagePlatform.PHP:
        return Platforms.PhpGenericLibV2;
      case LanguagePlatform.PYTHON:
        return Platforms.PythonGenericLib;
      case LanguagePlatform.RUBY:
        return Platforms.RubyGenericLib;
      case LanguagePlatform.TYPESCRIPT:
        return Platforms.TsGenericLib;
      case LanguagePlatform.GO:
        return Platforms.GoGenericLib;
      default:
        throw new Error(`Unknown LanguagePlatform: ${languagePlatform}`);
    }
  }
}
