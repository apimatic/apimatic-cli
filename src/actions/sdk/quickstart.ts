import { SdkQuickstartPrompts } from "../../prompts/sdk/quickstart.js";
import { ActionResult } from "../action-result.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { LoginAction } from "../auth/login.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { FilePath } from "../../types/file/filePath.js";
import { SpecContext } from "../../types/spec-context.js";
import { ValidateAction } from "../api/validate.js";
import { FileDownloadService } from "../../infrastructure/services/file-download-service.js";
import { FileService } from "../../infrastructure/file-service.js";
import { GenerateAction } from "./generate.js";
import { Language } from "../../types/sdk/generate.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { FileName } from "../../types/file/fileName.js";

const defaultSpecUrl = new UrlPath(
  `https://raw.githubusercontent.com/apimatic/sample-docs-as-code-portal/refs/heads/master/src/spec/openapi.json`
);
const metadataFileUrl = new UrlPath(
  `https://raw.githubusercontent.com/apimatic/sample-docs-as-code-portal/refs/heads/master/src/spec/APIMATIC-META.json`
);

export class SdkQuickstartAction {
  private readonly prompts = new SdkQuickstartPrompts();
  private readonly fileDownloadService = new FileDownloadService();
  private readonly fileService = new FileService();
  private readonly launcherService = new LauncherService();
  private readonly zipService = new ZipService();

  constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (): Promise<ActionResult> => {
    const storedAuth = await getAuthInfo(this.configDir.toString());
    if (!storedAuth?.authKey) {
      const loginResult = await new LoginAction(this.configDir, this.commandMetadata).execute();
      if (loginResult.isFailed()) {
        return ActionResult.failed();
      }
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath): Promise<ActionResult> => {
      // Step 1/4
      this.prompts.importSpecStep();

      let specPath: FilePath | undefined;
      while (!specPath) {
        const inputPath = await this.prompts.specPathPrompt(defaultSpecUrl);
        if (!inputPath) {
          this.prompts.noSpecSpecified();
          return ActionResult.cancelled();
        }

        if (inputPath instanceof UrlPath) {
          const downloadFileResult = await this.prompts.downloadSpecFile(
            this.fileDownloadService.downloadFile(inputPath)
          );
          if (downloadFileResult.isErr()) {
            this.prompts.serviceError(downloadFileResult.error);
          } else {
            const specContext = new SpecContext(tempDirectory);
            specPath = await specContext.save(downloadFileResult.value.stream, downloadFileResult.value.filename);
          }
        } else {
          const fileExists = await this.fileService.fileExists(inputPath);
          if (!fileExists) {
            this.prompts.specFileDoesNotExist();
          } else {
            specPath = inputPath;
          }
        }
      }

      // Step 2/4
      this.prompts.validateSpecStep();

      const validateAction = new ValidateAction(this.configDir, this.commandMetadata);
      const validationResult = await validateAction.execute(specPath, false);

      if (validationResult.isFailed()) {
        this.prompts.specValidationFailed();
        if (!(await this.prompts.useDefaultSpecPrompt())) {
          this.prompts.fixYourSpec();
          return ActionResult.cancelled();
        }
        const downloadFileResult = await this.prompts.downloadSpecFile(
          this.fileDownloadService.downloadFile(defaultSpecUrl)
        );
        if (downloadFileResult.isErr()) {
          this.prompts.serviceError(downloadFileResult.error);
        } else {
          const specContext = new SpecContext(tempDirectory);
          specPath = await specContext.save(downloadFileResult.value.stream, downloadFileResult.value.filename);
        }
      }

      // Step 3/4
      this.prompts.selectLanguageStep();

      const language = await this.prompts.selectLanguagePrompt();
      if (!language) {
        this.prompts.noLanguageSelected();
        return ActionResult.cancelled();
      }

      // Step 4/4
      this.prompts.selectInputDirectoryStep();

      let inputDirectory: DirectoryPath | undefined;
      while (true) {
        inputDirectory = await this.prompts.inputDirectoryPathPrompt();
        if (!inputDirectory) {
          this.prompts.noInputDirectoryProvided();
          return ActionResult.cancelled();
        }

        if (!(await this.fileService.directoryExists(inputDirectory))) {
          this.prompts.inputDirectoryPathDoesNotExist(inputDirectory);
          // TODO: Prompt user if he wants to create the directory
          continue;
        }

        if (!(await this.fileService.directoryEmpty(inputDirectory))) {
          this.prompts.inputDirectoryNotEmpty(inputDirectory);
          continue;
        }
        break;
      }

      // Setup source directory with spec folder
      const apimaticMetaFile = await this.prompts.downloadMetadataFile(
        this.fileDownloadService.downloadFile(metadataFileUrl)
      );
      if (apimaticMetaFile.isErr()) {
        this.prompts.serviceError(apimaticMetaFile.error);
        return ActionResult.failed();
      }
      const tempSpecDirectory = tempDirectory.join("spec");
      await this.fileService.createDirectoryIfNotExists(tempSpecDirectory);
      const metadataFilePath = new FilePath(tempSpecDirectory, apimaticMetaFile.value.filename);
      await this.fileService.writeFile(metadataFilePath, apimaticMetaFile.value.stream);

      if (await this.fileService.isZipFile(specPath)) {
        await this.zipService.unArchive(specPath, tempSpecDirectory);
      } else {
        await this.fileService.copyToDir(specPath, tempSpecDirectory);
      }


      const sourceDirectory = inputDirectory.join("src");
      const specDirectory = sourceDirectory.join("spec");
      await this.fileService.copyDirectoryContents(tempSpecDirectory, specDirectory);

      const sdkDirectory = inputDirectory.join("sdk");
      const sdkGenerateAction = new GenerateAction(this.configDir, this.commandMetadata);
      const result = await sdkGenerateAction.execute(specDirectory, sdkDirectory, language as Language, true, false);
      if (result.isFailed()) {
        return ActionResult.failed();
      }

      const languageDirectory = sdkDirectory.join(language);
      const readmeFilePath = new FilePath(languageDirectory, new FileName("README.md"));
      if (await this.launcherService.openFolderInIde(languageDirectory, readmeFilePath)) {
        this.prompts.sdkOpenedInEditor();
      }

      this.prompts.nextSteps(specDirectory, language);

      return ActionResult.success();
    });
  };
}
