import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { LoginAction } from "../auth/login.js";
import { Result } from "../../types/common/result.js";
import { err, ok, Result as ResultEx } from "neverthrow";
import { ActionResult } from "../action-result.js";
import { PortalServeAction } from "./serve.js";
import { ResourceContext } from "../../types/resource-context.js";
import { FileName } from "../../types/file/fileName.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { createResourceInput } from "../../types/file/resource-input.js";
import { ValidateAction } from "../api/validate.js";
import { ServiceError } from "../../infrastructure/api-utils.js";
import { BuildContext } from "../../types/build-context.js";
import { TempContext } from "../../types/temp-context.js";
import { FileDownloadService } from "../../infrastructure/services/file-download-service.js";
import { getLanguageConfig } from "../../types/build/build.js";

const defaultSpecUrl: UrlPath = new UrlPath(
  "https://raw.githubusercontent.com/apimatic/static-portal-workflow/refs/heads/master/spec/openapi.json"
);
const defaultPort: number = 3000 as const;


export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly fileDownloadService = new FileDownloadService();


  private readonly zipUrl = `https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip` as const;
  private readonly repositoryFolderName = "static-portal-workflow-master" as const;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
  }

  public readonly execute = async (): Promise<ActionResult> => {
    this.prompts.welcomeMessage();

    const authenticateUserResult = await this.authenticateUser();
    if (authenticateUserResult.isErr()) {
      return ActionResult.failed();
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath) => {
      // Step 1/4
      const specDirectory = await this.importSpec(tempDirectory);
      if (specDirectory.isErr()) {
        this.prompts.specImportError(specDirectory.error);
        if (specDirectory.error === "cancelled") return ActionResult.cancelled();
        return ActionResult.failed();
      }

      // Step 2/4
      const validatedSpecDirectory = await this.validateSpec(tempDirectory, specDirectory.value);
      if (validatedSpecDirectory.isFailed()) {
        this.prompts.specValidationError(validatedSpecDirectory.error!);
        return ActionResult.failed();
      }
      if (validatedSpecDirectory.isCancelled()) {
        this.prompts.fixYourSpec();
        return ActionResult.cancelled();
      }

      // Step 3/4
      const selectedLanguages = await this.selectLanguages();
      if (selectedLanguages.isErr()) {
        return ActionResult.cancelled();
      }

      // Step 4/4
      const inputDirectory = await this.selectInputDirectory();
      if (!inputDirectory) {
        return ActionResult.cancelled();
      }

      const masterBuildFile = await this.prompts.downloadBuildDirectory(
        this.fileDownloadService.downloadFile(new UrlPath(this.zipUrl))
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
      await tempBuildContext.replaceDefaultSpec(specDirectory.value);
      await tempBuildContext.deleteWorkflowDir();

      const buildFile = await tempBuildContext.getBuildFileContents();
      buildFile.generatePortal!.languageConfig = getLanguageConfig(selectedLanguages);
      await tempBuildContext.updateBuildFileContents(buildFile);

      const sourceDirectory = inputDirectory.join("src");
      await this.fileService.copyDirectoryContents(extractedFolder, sourceDirectory);
      this.prompts.displayBuildDirectoryAsTree(sourceDirectory);

      const portalDirectory = inputDirectory.join("portal");
      const servePortalResult = await this.servePortal(sourceDirectory, portalDirectory);
      if (servePortalResult.isErr()) {
        return ActionResult.failed();
      }
      return ActionResult.success();
    });
  };

  private async authenticateUser(): Promise<ResultEx<void, void>> {
    const storedAuth = await getAuthInfo(this.configDir.toString());
    if (storedAuth?.authKey) {
      return ok();
    }
    const loginResult = await new LoginAction(this.configDir, this.commandMetadata).execute();
    if (loginResult.isFailed()) {
      return err();
    }
    return ok();
  }

  private async importSpec(tempDirectory: DirectoryPath): Promise<ResultEx<DirectoryPath, string>> {
    this.prompts.importSpecStep();
    const inputPath = await this.prompts.specPathPrompt(defaultSpecUrl);
    if (inputPath === null) {
      return err("Operation cancelled. No API Definition was provided.");
    }

    const urlPath = UrlPath.create(inputPath);
    const resourceContext = new ResourceContext(tempDirectory);
    const result =
      urlPath === undefined
        ? await resourceContext.resolveTo(createResourceInput(inputPath))
        : await resourceContext.resolveTo(urlPath);
    if (result.isErr()) {
      return err(result.error);
    }

    const specDirectory = tempDirectory.join("spec");
    await this.fileService.createDirectoryIfNotExists(specDirectory);
    await this.fileService.copy(result.value, result.value.replaceDirectory(specDirectory));
    return ok(specDirectory);
  }

  private async validateSpec(
    tempDirectory: DirectoryPath,
    specDirectory: DirectoryPath
  ): Promise<Result<DirectoryPath, ServiceError>> {
    this.prompts.validateSpecStep();
    const specZipFilePath = new FilePath(tempDirectory, new FileName("spec.zip"));
    await this.zipService.archive(specDirectory, specZipFilePath);

    const validateAction = new ValidateAction(this.configDir, this.commandMetadata);
    const validationResult = await validateAction.execute(specZipFilePath, false);

    if (validationResult.isFailed()) {
      if (!(await this.prompts.useDefaultSpecPrompt())) {
        return Result.cancelled(specDirectory);
      }

      const resourceContext = new ResourceContext(tempDirectory);
      const result = await resourceContext.resolveTo(defaultSpecUrl);
      if (result.isErr()) {
        return Result.failure(result.error);
      }
      await this.fileService.cleanDirectory(specDirectory);
      await this.fileService.copy(result.value, result.value.replaceDirectory(specDirectory));
    }

    return Result.success(specDirectory);
  }

  private async selectLanguages(): Promise<ResultEx<string[], string>> {
    this.prompts.selectLanguagesStep();

    const languages = await this.prompts.selectLanguagesPrompt();
    if (languages === null) {
      this.prompts.noLanguagesSelected();
      return err("cancelled");
    }

    return ok(languages);
  }

  private async selectInputDirectory(): Promise< DirectoryPath | undefined> {
    this.prompts.selectInputDirectoryStep();
    const inputDirectory = await this.prompts.inputDirectoryPathPrompt();
    if (inputDirectory) {
      return inputDirectory;
    } else {
      this.prompts.noInputDirectoryProvided();
    }
  }

  private async servePortal(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath
  ): Promise<ResultEx<string, string>> {
    const portalServeAction = new PortalServeAction(this.configDir, this.commandMetadata, null, false);
    const result = await portalServeAction.execute(
      buildDirectory,
      portalDirectory,
      defaultPort,
      true,
      false,
      async () => {
        this.prompts.nextSteps();
      }
    );

    // TODO: Figure out a better way for this.
    return result.mapAll<ResultEx<string, string>>(
      () => {
        return ok("Generated portal and served it successfully.");
      },
      () => {
        return err(result.getMessage());
      },
      () => {
        return err(result.getMessage());
      }
    );
  }
}
