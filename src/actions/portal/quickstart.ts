import axios from "axios";
import filetype from "file-type";
import { ApiValidationSummary } from "@apimatic/sdk";
import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { getMessageInOrangeColor, getMessageInMagentaColor, getMessageInCyanColor } from "../../utils/utils.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { PortalScaffoldService } from "../../infrastructure/services/portal-scaffold-service.js";
import { LoginAction } from "../auth/login.js";
import { Result } from "../../types/common/result.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { ActionResult } from "../action-result.js";
import { GenerateAction } from "./generate.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { PortalServeAction } from "./serve.js";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { ValidationService } from "../../infrastructure/services/validation-service.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { QuickstartInitiatedEvent } from "../../types/events/quickstart-initiated.js";
import { QuickstartCompletedEvent } from "../../types/events/quickstart-completed.js";
import { SpecPathFactory } from "../../types/file/spec-path.js";

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalScaffoldService: PortalScaffoldService = new PortalScaffoldService();
  private readonly validationService: ValidationService = new ValidationService();
  private readonly telemetryService: TelemetryService;
  private readonly defaultSpecUrl: string =
    "https://raw.githubusercontent.com/apimatic/static-portal-workflow/refs/heads/master/spec/openapi.json" as const;
  private readonly defaultPort: number = 3000 as const;
  private readonly configDir: DirectoryPath;

  constructor(configDir: DirectoryPath) {
    this.configDir = configDir;
    this.telemetryService = new TelemetryService(this.configDir.toString());
  }

  public readonly execute = async (commandName: string): Promise<ActionResult> => {
    this.prompts.displayWelcomeMessage();

    await this.telemetryService.trackEvent(new QuickstartInitiatedEvent());

    const authenticateUserResult = await this.authenticateUser(this.configDir);

    if (authenticateUserResult.isFailed()) {
      return ActionResult.error(authenticateUserResult.error!);
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath) => {
      const specPath = await this.getSpecPath();

      const specFilePathResult = await this.setupSpecFile(tempDirectory, specPath);
      if (specFilePathResult.isFailed()) {
        return ActionResult.error(specFilePathResult.error!);
      }

      const validateSpecResult = await this.validateSpecFile(specFilePathResult.value!, this.configDir);
      if (validateSpecResult.isFailed()) {
        return ActionResult.error(validateSpecResult.error!);
      }

      const buildDirectoryResult = await this.setupLanguagesAndBuildDirectory(
        tempDirectory,
        specFilePathResult.value!,
        validateSpecResult.isCancelled()
      );
      if (buildDirectoryResult.isFailed()) {
        return ActionResult.error(buildDirectoryResult.error!);
      }

      const generateAndServePortalResult = await this.generateAndServePortal(buildDirectoryResult.value!, commandName);
      if (generateAndServePortalResult.isFailed()) {
        return ActionResult.error(generateAndServePortalResult.error!);
      }

      if (generateAndServePortalResult.isCancelled()) {
        return ActionResult.cancelled(generateAndServePortalResult.value!);
      }

      await this.telemetryService.trackEvent(new QuickstartCompletedEvent());

      return ActionResult.success(buildDirectoryResult.value!.toString());
    });
  };

  private async authenticateUser(configDir: DirectoryPath): Promise<Result<string, string>> {
    const isUserAuthenticated = await this.isUserAuthenticated(configDir);

    if (!isUserAuthenticated) {
      this.prompts.displayInfo("You need to be logged in to continue.");
      const loginAction = new LoginAction(configDir);
      const loginResult = await loginAction.execute();

      loginResult.match(
        (email) => this.prompts.displaySuccess(email),
        (error) => this.prompts.logError(error)
      );

      if (loginResult.isErr())
        return Result.failure("Unable to login, please check your credentials and try again later.");
    }

    return Result.success("Authentication was successful.");
  }

  private async isUserAuthenticated(configDir: DirectoryPath): Promise<boolean> {
    const storedAuth = await getAuthInfo(configDir.toString());
    if (!storedAuth?.authKey) {
      return false;
    }
    return true;
  }

  private async getSpecPath(): Promise<string> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 1 of 4: Import your OpenAPI Definition`));
    return await this.prompts.specPathPrompt(this.defaultSpecUrl);
  }

  private async setupSpecFile(tempDirectory: DirectoryPath, specPath: string): Promise<Result<FilePath, string>> {
    try {
      const spec = SpecPathFactory.create(specPath);
      if (spec instanceof UrlPath) {
        const response = await axios.get(spec.toString(), { responseType: "stream" });

        if (response.status !== 200) {
          return Result.failure(
            "Unable to download the API Definition. Please verify that the provided URL is correct and publicly accessible. "
          );
        }

        const specFilePath = new FilePath(tempDirectory, spec.fileName());
        await this.fileService.writeFile(specFilePath, response.data as NodeJS.ReadableStream);
        return Result.success(specFilePath);
      }

      const fileType = await filetype.fromFile(spec.toString());
      if (fileType?.ext === "zip") {
        await this.zipService.unArchive(spec, tempDirectory);
      } else {
        await this.fileService.copyToDirectory(spec, tempDirectory);
      }

      return Result.success(spec);
    } catch {
      return Result.failure(
        "Something went wrong while setting up the API Definition. Please try again later. If the issue persists, contact our team at support@apimatic.io"
      );
    }
  }

  private async validateSpecFile(specFilePath: FilePath, configDir: DirectoryPath): Promise<Result<string, string>> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 2 of 4: Validate and Lint your OpenAPI file`));
    this.prompts.startProgressIndicator(
      getMessageInMagentaColor(
        `Running your API Definition through APIMatic's 1200+ CodeGen Specific validation and linting rules 🔍 `
      )
    );
    const specFileStream = await this.fileService.getStream(specFilePath);
    let result: Result<ApiValidationSummary, string>;

    try {
      result = await this.validationService.validateSpec(specFileStream, configDir);
    } finally {
      specFileStream.close();
    }

    if (result.isFailed()) {
      this.prompts.stopProgressIndicator(`Something went wrong while validating your API Definition.`, 1);
      return Result.failure(result.error!);
    }

    const validationPassed = result.value!.success;
    if (validationPassed) {
      this.prompts.stopProgressIndicator(getMessageInCyanColor(`Validation Successful.`));
    } else {
      this.prompts.stopProgressIndicator(`❗ Oops, it looks like there are some errors in your API Definition.`, 1);
      if (!(await this.prompts.useDefaultSpecPrompt())) {
        return Result.cancelled(
          "Good luck fixing your API definition! 🛠️  Feel free to run this command again once you're done."
        );
      }
    }

    return Result.success("API Validation successful.");
  }

  private async getSelectedLanguages(): Promise<string[]> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 3 of 4: Select programming languages`));

    return await this.prompts.selectLanguagesPrompt();
  }

  private async getBuildDirectoryPath() {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 4 of 4: Generate source files for Docs as Code`));
    return new DirectoryPath(await this.prompts.buildDirectoryPathPrompt());
  }

  private async setupLanguagesAndBuildDirectory(
    tempDirectory: DirectoryPath,
    specFilePath: FilePath,
    useDefaultSpec: boolean
  ): Promise<Result<DirectoryPath, string>> {
    const selectedLanguages: string[] = await this.getSelectedLanguages();
    const buildDirectoryPath: DirectoryPath = await this.getBuildDirectoryPath();

    const setupBuildDirectoryResult = await this.setupBuildDirectory(
      tempDirectory,
      buildDirectoryPath,
      specFilePath,
      selectedLanguages,
      useDefaultSpec
    );
    if (setupBuildDirectoryResult.isFailed()) {
      return Result.failure(setupBuildDirectoryResult.error!);
    }

    return Result.success(buildDirectoryPath);
  }

  private async setupBuildDirectory(
    tempDirectory: DirectoryPath,
    buildDirectoryPath: DirectoryPath,
    specFilePath: FilePath,
    selectedLanguages: string[],
    useDefaultSpec: boolean = false
  ): Promise<Result<string, string>> {
    this.prompts.startProgressIndicator(getMessageInMagentaColor("Generating build directory ⚙️"));

    const buildDirectory = buildDirectoryPath.join("src");

    const scaffoldBuildDirectoryResult = await this.portalScaffoldService.scaffoldBuildDirectory(
      tempDirectory,
      buildDirectory,
      specFilePath,
      selectedLanguages,
      useDefaultSpec
    );

    if (scaffoldBuildDirectoryResult.isFailed()) {
      this.prompts.stopProgressIndicator(`Something went wrong while setting up your build directory.`, 1);
      return Result.failure(scaffoldBuildDirectoryResult.error!);
    }

    this.prompts.stopProgressIndicator(getMessageInCyanColor(`📁 Directory created at ${buildDirectory.toString()}`));

    this.prompts.displayBuildDirectoryAsTree(buildDirectory.toString());

    return Result.success("Build directory setup successfully.");
  }

  private async generateAndServePortal(
    buildDirectoryPath: DirectoryPath,
    commandName: string
  ): Promise<Result<string, string>> {
    const buildDirectory = buildDirectoryPath.join("src");
    const portalDirectory = buildDirectoryPath.join("portal");

    const generatePortalAction = new GenerateAction(this.configDir, null);
    const portalServeAction = new PortalServeAction(new PortalServePrompts(), new ServeHandler(), new PortalService());

    const serveFlags: ServeFlags = {
      input: buildDirectory.toString(),
      destination: portalDirectory.toString(),
      port: this.defaultPort,
      open: true,
      "no-reload": false,
      "auth-key": undefined
    };

    const servePaths: ServePaths = {
      sourceDirectoryPath: buildDirectory.toString(),
      destinationDirectoryPath: portalDirectory.toString()
    };

    const servePortalResult = await portalServeAction.servePortal(
      serveFlags,
      servePaths,
      commandName,
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
