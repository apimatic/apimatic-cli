import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { PortalScaffoldService } from "../../infrastructure/services/portal-scaffold-service.js";
import { LoginAction } from "../auth/login.js";
import { Result } from "../../types/common/result.js";
import { err, ok, Result as ResultEx } from "neverthrow";
import { ActionResult } from "../action-result.js";
import { PortalServeAction } from "./serve.js";
import { ValidationService } from "../../infrastructure/services/validation-service.js";
import { ResourceContext } from "../../types/resource-context.js";
import { FileName } from "../../types/file/fileName.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { createResourceInput } from "../../types/file/resource-input.js";
import { ValidateAction } from "../api/validate.js";

const defaultSpecUrl: UrlPath = new UrlPath(
  "https://raw.githubusercontent.com/apimatic/static-portal-workflow/refs/heads/master/spec/openapi.json"
);
const defaultPort: number = 3000 as const;

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalScaffoldService: PortalScaffoldService = new PortalScaffoldService();
  private readonly validationService: ValidationService;
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.validationService = new ValidationService(configDir);
  }

  public readonly execute = async (): Promise<ActionResult> => {
    this.prompts.welcomeMessage();

    const authenticateUserResult = await this.authenticateUser();
    if (authenticateUserResult.isFailed()) {
      this.prompts.loginFailed();
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
      const selectedLanguagesResult = await this.selectLanguages();
      if (selectedLanguagesResult.isErr()) {
        return ActionResult.cancelled();
      }

      // Step 4/4
      const selectInputDirectoryResult = await this.selectInputDirectory();
      if (selectInputDirectoryResult.isErr()) {
        return ActionResult.cancelled();
      }

      const { sourceDirectory, portalDirectory } = selectInputDirectoryResult.value;
      const buildDirectoryResult = await this.setupBuildDirectory(
        tempDirectory,
        sourceDirectory,
        validatedSpecDirectory.value!,
        selectedLanguagesResult.value
      );
      if (buildDirectoryResult.isErr()) {
        this.prompts.buildSetupError(buildDirectoryResult.error);
        return ActionResult.failed();
      }

      const generateAndServePortalResult = await this.servePortal(sourceDirectory, portalDirectory);
      if (generateAndServePortalResult.isErr()) {
        this.prompts.portalGenerationError(generateAndServePortalResult.error);
        return ActionResult.failed();
      }

      this.prompts.nextSteps(sourceDirectory.toString());
      return ActionResult.success();
    });
  };

  // TODO: LoginAction needs to be fixed to use prompts framework, then we can fix this.
  private async authenticateUser(): Promise<Result<string, string>> {
    const storedAuth = await getAuthInfo(this.configDir.toString());
    if (storedAuth?.authKey) {
      return Result.success("User is already authenticated.");
    }

    this.prompts.loginRequired();
    const loginResult = await new LoginAction(this.configDir, this.commandMetadata).execute();

    // TODO: fix error messages after refactoring
    return loginResult.mapAll(
      () => Result.success("Authentication was successful."),
      () => Result.failure("Unable to login, please check your credentials and try again later."),
      () => Result.failure("Unable to login, please check your credentials and try again later.")
    );
  }

  // TODO: create TempSpecContext and then refactor this.
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

  // TODO: Needs to be refactored after refactoring validate action.
  private async validateSpec(
    tempDirectory: DirectoryPath,
    specDirectory: DirectoryPath
  ): Promise<Result<DirectoryPath, string>> {
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

  private async selectInputDirectory(): Promise<
    ResultEx<{ sourceDirectory: DirectoryPath; portalDirectory: DirectoryPath }, string>
  > {
    this.prompts.selectInputDirectoryStep();

    const inputDirectoryPath = await this.prompts.inputDirectoryPathPrompt();
    if (inputDirectoryPath === null) {
      this.prompts.noInputDirectoryProvided();
      return err("cancelled");
    }

    const workingDirectory = new DirectoryPath(inputDirectoryPath);
    return ok({ sourceDirectory: workingDirectory.join("src"), portalDirectory: workingDirectory.join("portal") });
  }

  //TODO: Remove tempDirectory as param.
  private async setupBuildDirectory(
    tempDirectory: DirectoryPath,
    sourceDirectory: DirectoryPath,
    specDirectory: DirectoryPath,
    selectedLanguages: string[]
  ): Promise<ResultEx<DirectoryPath, string>> {
    const result = await this.prompts.createBuildDirectory(
      sourceDirectory.toString(),
      this.portalScaffoldService.createBuildDirectory(tempDirectory, specDirectory, selectedLanguages)
    );
    if (result.isErr()) {
      return err(result.error);
    }

    await this.fileService.copyDirectoryContents(result.value, sourceDirectory);
    this.prompts.displayBuildDirectoryAsTree(sourceDirectory);

    return ok(result.value);
  }

  private async servePortal(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath
  ): Promise<ResultEx<string, string>> {
    const portalServeAction = new PortalServeAction(this.configDir, this.commandMetadata, null, false);
    const result = await portalServeAction.execute(buildDirectory, portalDirectory, defaultPort, true, false);

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
