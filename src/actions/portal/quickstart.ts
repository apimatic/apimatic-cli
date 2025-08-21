import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { getMessageInCyanColor, getMessageInMagentaColor, getMessageInOrangeColor } from "../../utils/utils.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { PortalScaffoldService } from "../../infrastructure/services/portal-scaffold-service.js";
import { LoginAction } from "../auth/login.js";
import { Result } from "../../types/common/result.js";
import { err, ok, Result as ResultEx } from "neverthrow";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { ActionResult } from "../action-result.js";
import { GenerateAction } from "./generate.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { PortalServeAction } from "./serve.js";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { ValidationService } from "../../infrastructure/services/validation-service.js";
import { ResourceContext } from "../../types/resource-context.js";
import { FileName } from "../../types/file/fileName.js";

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalScaffoldService: PortalScaffoldService = new PortalScaffoldService();
  private readonly validationService: ValidationService;
  private readonly defaultSpecUrl: UrlPath = new UrlPath(
    "https://raw.githubusercontent.com/apimatic/static-portal-workflow/refs/heads/master/spec/openapi.json"
  );
  private readonly defaultPort: number = 3000 as const;
  private readonly configDir: DirectoryPath;
  private readonly commandName: string;

  constructor(configDir: DirectoryPath, commandName: string) {
    this.configDir = configDir;
    this.commandName = commandName;
    this.validationService = new ValidationService(configDir);
  }

  public readonly execute = async (): Promise<ActionResult> => {
    this.prompts.displayWelcomeMessage();

    const authenticateUserResult = await this.authenticateUser(this.configDir);
    if (authenticateUserResult.isFailed()) {
      return ActionResult.error(authenticateUserResult.error!);
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath) => {
      // Step 1/4
      const specDirectory = await this.importSpec(tempDirectory);
      if (specDirectory.isErr()) {
        return ActionResult.error(specDirectory.error);
      }

      // Step 2/4
      const validatedSpecDirectory = await this.validateSpec(tempDirectory, specDirectory.value);
      if (validatedSpecDirectory.isFailed()) {
        return ActionResult.error(validatedSpecDirectory.error!);
      }
      if (validatedSpecDirectory.isCancelled()) {
        return ActionResult.cancelled(
          "Good luck fixing your API definition! Feel free to run this command again once you're done."
        );
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
      if (buildDirectoryResult.isFailed()) {
        return ActionResult.error(buildDirectoryResult.error!);
      }

      const generateAndServePortalResult = await this.generateAndServePortal(sourceDirectory, portalDirectory);

      if (generateAndServePortalResult.isFailed()) {
        return ActionResult.error(generateAndServePortalResult.error!);
      }

      if (generateAndServePortalResult.isCancelled()) {
        return ActionResult.cancelled(generateAndServePortalResult.value!);
      }

      return ActionResult.success(buildDirectoryResult.value!.toString());
    });
  };

  private async authenticateUser(configDir: DirectoryPath): Promise<Result<string, string>> {
    const storedAuth = await getAuthInfo(configDir.toString());
    if (storedAuth?.authKey) {
      return Result.success("User is already authenticated.");
    }

    this.prompts.displayInfo("You need to be logged in to continue.");
    const loginResult = await new LoginAction(configDir).execute();

    if (loginResult.isErr()) {
      this.prompts.logError(loginResult.error);
      return Result.failure("Unable to login, please check your credentials and try again later.");
    }
    this.prompts.displaySuccess(`Logged in as: ${loginResult.value}`);
    return Result.success("Authentication was successful.");
  }

  // TODO: create TempSpecContext and then refactor this.
  private async importSpec(tempDirectory: DirectoryPath): Promise<ResultEx<DirectoryPath, string>> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 1 of 4: Import your OpenAPI Definition`));
    const inputPath = await this.prompts.specPathPrompt(this.defaultSpecUrl);

    const resourceContext = new ResourceContext(tempDirectory);
    const result = await resourceContext.resolve(inputPath);
    if (result.isErr()) {
      return err(result.error);
    }

    const { destinationFilePath, fileName } = result.value;
    const specDirectory = await resourceContext.prepare(destinationFilePath, fileName, "spec");
    return ok(specDirectory);
  }

  private async validateSpec(
    tempDirectory: DirectoryPath,
    specDirectory: DirectoryPath
  ): Promise<Result<DirectoryPath, string>> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 2 of 4: Validate and Lint your OpenAPI file`));
    this.prompts.startProgressIndicator(
      getMessageInMagentaColor(
        `Running your API Definition through APIMatic's 1200+ CodeGen Specific validation and linting rules 🔍 `
      )
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
      this.prompts.stopProgressIndicator(getMessageInCyanColor(`Validation Successful.`));
      return Result.success(specDirectory);
    }

    this.prompts.stopProgressIndicator(`❗ Oops, it looks like there are some errors in your API Definition.`, 1);
    if (!(await this.prompts.useDefaultSpecPrompt())) {
      return Result.cancelled(specDirectory);
    }

    // Use default spec...
    const resourceContext = new ResourceContext(tempDirectory);
    const result = await resourceContext.resolve(this.defaultSpecUrl.toString());
    if (result.isErr()) {
      return Result.failure(result.error);
    }

    const { destinationFilePath, fileName } = result.value;
    return Result.success(await resourceContext.prepare(destinationFilePath, fileName, "spec"));
  }

  private async selectLanguages(): Promise<string[]> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 3 of 4: Select programming languages`));

    return await this.prompts.selectLanguagesPrompt();
  }

  private async selectInputDirectory(): Promise<{ sourceDirectory: DirectoryPath; portalDirectory: DirectoryPath }> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 4 of 4: Generate source files for Docs as Code`));

    const workingDirectory = new DirectoryPath(await this.prompts.inputDirectoryPathPrompt());

    return { sourceDirectory: workingDirectory.join("src"), portalDirectory: workingDirectory.join("portal") };
  }

  //TODO: Remove tempDirectory as param.
  private async setupBuildDirectory(
    tempDirectory: DirectoryPath,
    sourceDirectory: DirectoryPath,
    specDirectory: DirectoryPath,
    selectedLanguages: string[]
  ): Promise<Result<DirectoryPath, string>> {
    this.prompts.startProgressIndicator(getMessageInMagentaColor("Generating build directory ⚙️"));

    //TODO: Create a separate temp directory for scaffolding, don't pass the existing temp directory.
    const createBuildDirectoryResult = await this.portalScaffoldService.createBuildDirectory(
      tempDirectory,
      specDirectory,
      selectedLanguages
    );
    if (createBuildDirectoryResult.isErr()) {
      this.prompts.stopProgressIndicator(`Something went wrong while setting up your build directory.`, 1);
      return Result.failure(createBuildDirectoryResult.error);
    }

    await this.fileService.copyDirectoryContents(createBuildDirectoryResult.value!, sourceDirectory);
    this.prompts.stopProgressIndicator(getMessageInCyanColor(`📁 Directory created at ${sourceDirectory.toString()}`));
    this.prompts.displayBuildDirectoryAsTree(sourceDirectory.toString());

    return Result.success(sourceDirectory);
  }

  private async generateAndServePortal(
    sourceDirectory: DirectoryPath,
    portalDirectory: DirectoryPath
  ): Promise<Result<string, string>> {
    const generatePortalAction = new GenerateAction(this.configDir, null);
    const portalServeAction = new PortalServeAction(new PortalServePrompts(), new ServeHandler(), new PortalService());

    const serveFlags: ServeFlags = {
      input: sourceDirectory.toString(),
      destination: portalDirectory.toString(),
      port: this.defaultPort,
      open: true,
      "no-reload": false,
      "auth-key": undefined
    };

    const servePaths: ServePaths = {
      sourceDirectoryPath: sourceDirectory.toString(),
      destinationDirectoryPath: portalDirectory.toString()
    };

    const servePortalResult = await portalServeAction.servePortal(
      serveFlags,
      servePaths,
      this.commandName,
      generatePortalAction.execute
    );

    if (servePortalResult.isFailed()) {
      return Result.failure(servePortalResult.error!);
    }

    if (servePortalResult.isCancelled()) {
      return Result.cancelled(servePortalResult.value!);
    }

    return Result.success("Generated portal and served it successfully.");
  }
}
