import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { LoginAction } from "../auth/login.js";
import { ActionResult } from "../action-result.js";
import { PortalServeAction } from "./serve.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { ValidateAction } from "../api/validate.js";
import { BuildContext } from "../../types/build-context.js";
import { TempContext } from "../../types/temp-context.js";
import { FileDownloadService } from "../../infrastructure/services/file-download-service.js";
import { getLanguagesConfig } from "../../types/build/build.js";
import { FilePath } from "../../types/file/filePath.js";


const defaultPort: number = 3000 as const;

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly fileDownloadService = new FileDownloadService();
  private readonly buildFileUrl = new UrlPath(`https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip`);
  private readonly defaultSpecUrl = new UrlPath(`https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip`);
  private readonly repositoryFolderName = "static-portal-workflow-master" as const;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
  }

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
        const inputPath = await this.prompts.specPathPrompt(this.defaultSpecUrl);
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
            const tempContext = new TempContext(tempDirectory);
            specPath = await tempContext.save(downloadFileResult.value);
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
        if (!(await this.prompts.useDefaultSpecPrompt())) {
          this.prompts.fixYourSpec();
          return ActionResult.cancelled();
        }
        const downloadFileResult = await this.prompts.downloadSpecFile(
          this.fileDownloadService.downloadFile(this.defaultSpecUrl)
        );
        if (downloadFileResult.isErr()) {
          this.prompts.serviceError(downloadFileResult.error);
        } else {
          const tempContext = new TempContext(tempDirectory);
          specPath = await tempContext.save(downloadFileResult.value);
        }
      }

      // Step 3/4
      this.prompts.selectLanguagesStep();
      const languages = await this.prompts.selectLanguagesPrompt();
      if (!languages) {
        this.prompts.noLanguagesSelected();
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
          continue;
        }

        if (!(await this.fileService.directoryEmpty(inputDirectory))) {
          this.prompts.inputDirectoryNotEmpty(inputDirectory);
          continue;
        }
        break;
      }

      const masterBuildFile = await this.prompts.downloadBuildDirectory(
        this.fileDownloadService.downloadFile(this.buildFileUrl)
      );
      if (masterBuildFile.isErr()) {
        this.prompts.serviceError(masterBuildFile.error);
        return ActionResult.failed();
      }
      const tempContext = new TempContext(tempDirectory);
      const masterBuildFilePath = await tempContext.save(masterBuildFile.value);
      await this.zipService.unArchive(masterBuildFilePath, tempDirectory);
      const extractedFolder = tempDirectory.join(this.repositoryFolderName);

      const tempBuildContext = new BuildContext(extractedFolder);
      await tempBuildContext.replaceDefaultSpec(specPath);
      await tempBuildContext.deleteWorkflowDir();

      const buildFile = await tempBuildContext.getBuildFileContents();
      buildFile.generatePortal!.languageConfig = getLanguagesConfig(languages);
      await tempBuildContext.updateBuildFileContents(buildFile);

      const sourceDirectory = inputDirectory.join("src");
      await this.fileService.copyDirectoryContents(extractedFolder, sourceDirectory);

      const buildDirectoryStructure = await this.fileService.getDirectory(sourceDirectory);
      this.prompts.printDirectoryStructure(buildDirectoryStructure);

      const portalDirectory = inputDirectory.join("portal");
      const portalServeAction = new PortalServeAction(this.configDir, this.commandMetadata, null);
      const result = await portalServeAction.execute(sourceDirectory, portalDirectory, defaultPort, true, false, () => {
        this.prompts.nextSteps();
      });
      if (result.isFailed()) {
        return ActionResult.failed();
      }
      return ActionResult.success();
    });
  };
}
