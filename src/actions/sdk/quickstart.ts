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
import { TempContext } from "../../types/temp-context.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { BuildContext } from "../../types/build-context.js";
import { GenerateAction } from "./generate.js";
import { Language } from "../../types/sdk/generate.js";

const defaultSpecUrl = new UrlPath(
  `https://raw.githubusercontent.com/apimatic/static-portal-workflow/refs/heads/master/spec/openapi.json`
);
const buildFileUrl = new UrlPath(`https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip`);
const repositoryFolderName = "static-portal-workflow-master" as const;

export class SdkQuickstartAction {
  private readonly prompts = new SdkQuickstartPrompts();
  private readonly fileDownloadService = new FileDownloadService();
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (): Promise<ActionResult> => {
    this.prompts.welcomeMessage();

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

      // Setup directory for SDK generation
      const masterBuildFile = await this.prompts.downloadBuildDirectory(
        this.fileDownloadService.downloadFile(buildFileUrl)
      );
      if (masterBuildFile.isErr()) {
        this.prompts.serviceError(masterBuildFile.error);
        return ActionResult.failed();
      }
      const tempContext = new TempContext(tempDirectory);
      const masterBuildFilePath = await tempContext.save(masterBuildFile.value.stream);
      await this.zipService.unArchive(masterBuildFilePath, tempDirectory);
      const extractedFolder = tempDirectory.join(repositoryFolderName);

      const tempBuildContext = new BuildContext(extractedFolder);
      await tempBuildContext.replaceDefaultSpec(specPath);
      await tempBuildContext.deleteWorkflowDir();
      await tempBuildContext.deleteContentDir();
      await tempBuildContext.deleteStaticDir();
      await tempBuildContext.deleteBuildFile();
      await tempBuildContext.deleteReadmeFile();

      const sourceDirectory = inputDirectory.join("src");
      await this.fileService.copyDirectoryContents(extractedFolder, sourceDirectory);

      const buildDirectoryStructure = await this.fileService.getDirectory(sourceDirectory);
      this.prompts.printDirectoryStructure(inputDirectory, buildDirectoryStructure);

      const sdkDirectory = inputDirectory.join("sdk");
      const specDirectory = sourceDirectory.join("spec");
      const sdkGenerateAction = new GenerateAction(this.configDir, this.commandMetadata);
      const result = await sdkGenerateAction.execute(specDirectory, sdkDirectory, language as Language, true, false);
      if (result.isFailed()) {
        return ActionResult.failed();
      }

      return ActionResult.success();
    });
  };
}
