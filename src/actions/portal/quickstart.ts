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
    this.validationService = new ValidationService(configDir, commandMetadata);
  }

  public readonly execute = async (): Promise<ActionResult> => {
    this.prompts.welcomeMessage();

    const authenticateUserResult = await this.authenticateUser();
    if (authenticateUserResult.isErr()) {
      this.prompts.loginFailed();
      return ActionResult.failed();
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath) => {
      // Step 1/4
      const specDirectory = await this.importSpec(tempDirectory);
      if (specDirectory.isErr()) {
        this.prompts.specImportError(specDirectory.error);
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

      // Step 4/4
      const { sourceDirectory, portalDirectory } = await this.selectInputDirectory();

      const buildDirectoryResult = await this.setupBuildDirectory(
        tempDirectory,
        sourceDirectory,
        validatedSpecDirectory.value!,
        selectedLanguages
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
  private async authenticateUser(): Promise<ResultEx<void, void>> {
    const storedAuth = await getAuthInfo(this.configDir.toString());
    if (storedAuth?.authKey) {
      return ok();
    }

    this.prompts.loginRequired();
    const loginResult = await new LoginAction(this.configDir, this.commandMetadata).execute();

    if (loginResult.isErr()) {
      return err();
    }
    this.prompts.loginSuccessful(loginResult.value);
    return ok();
  }

  // TODO: create TempSpecContext and then refactor this.
  private async importSpec(tempDirectory: DirectoryPath): Promise<ResultEx<DirectoryPath, string>> {
    this.prompts.importSpecStep();
    const inputPath = await this.prompts.specPathPrompt(defaultSpecUrl);

    const resourceContext = new ResourceContext(tempDirectory);
    const result = await resourceContext.resolveTo(inputPath, "spec");
    if (result.isErr()) {
      return err(result.error);
    }
    return ok(result.value);
  }

  // TODO: Needs to be refactored after refactoring validate action.
  private async validateSpec(
    tempDirectory: DirectoryPath,
    specDirectory: DirectoryPath
  ): Promise<Result<DirectoryPath, string>> {
    this.prompts.validateSpecStep();
    this.prompts.startProgressIndicator(
      `Running your API Definition through APIMatic's 1200+ CodeGen Specific validation and linting rules`
    );

    //TODO: Replace with validate action.
    const specZipFilePath = new FilePath(tempDirectory, new FileName("spec.zip"));
    await this.zipService.archive(specDirectory, specZipFilePath);

    const validationResult = await this.validationService.validateViaFile({ file: specZipFilePath });
    // TODO: Add spinner when refactoring
    if (validationResult.isFailed()) {
      this.prompts.stopProgressIndicator(`Something went wrong while validating your API Definition.`, 1);
      return Result.failure(validationResult.error!);
    }

    const validationPassed = validationResult.value!.success;
    if (validationPassed) {
      this.prompts.stopProgressIndicator(`Validation Successful.`);
      return Result.success(specDirectory);
    }

    this.prompts.stopProgressIndicator(`Oops, it looks like there are some errors in your API Definition.`, 1);
    if (!(await this.prompts.useDefaultSpecPrompt())) {
      return Result.cancelled(specDirectory);
    }

    // Use default spec...
    const resourceContext = new ResourceContext(tempDirectory);
    const result = await resourceContext.resolveTo(defaultSpecUrl.toString(), "spec");
    if (result.isErr()) {
      return Result.failure(result.error);
    }
    return Result.success(result.value);
  }

  private async selectLanguages(): Promise<string[]> {
    this.prompts.selectLanguagesStep();

    return await this.prompts.selectLanguagesPrompt();
  }

  private async selectInputDirectory(): Promise<{ sourceDirectory: DirectoryPath; portalDirectory: DirectoryPath }> {
    this.prompts.selectInputDirectoryStep();

    const workingDirectory = new DirectoryPath(await this.prompts.inputDirectoryPathPrompt());

    return { sourceDirectory: workingDirectory.join("src"), portalDirectory: workingDirectory.join("portal") };
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
    this.prompts.displayBuildDirectoryAsTree(sourceDirectory.toString());

    return ok(result.value);
  }

  private async servePortal(
    buildDirectory: DirectoryPath,
    portalDirectory: DirectoryPath
  ): Promise<ResultEx<string, string>> {
    const portalServeAction = new PortalServeAction(this.configDir, this.commandMetadata, null);
    const result = await portalServeAction.execute(buildDirectory, portalDirectory, defaultPort, true, false, false);

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
