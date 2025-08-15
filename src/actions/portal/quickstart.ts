import path from "path";
import axios from "axios";
import filetype from "file-type";
import { ApiValidationSummary } from "@apimatic/sdk";
import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileName } from "../../types/file/fileName.js";
import { FilePath } from "../../types/file/filePath.js";
import {
  isValidUrl,
  getMessageInOrangeColor,
  getMessageInMagentaColor,
  getMessageInCyanColor
} from "../../utils/utils.js";
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

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalScaffoldService: PortalScaffoldService = new PortalScaffoldService();
  private readonly validationService: ValidationService = new ValidationService();
  private readonly defaultSpecUrl: string =
    "https://raw.githubusercontent.com/apimatic/static-portal-workflow/refs/heads/master/spec/openapi.json" as const;
  private readonly defaultPort: number = 3000 as const;
  private readonly configDir: DirectoryPath;

  constructor(configDir: DirectoryPath) {
    this.configDir = configDir;
  }

  public readonly execute = async (): Promise<ActionResult> => {
    this.prompts.displayWelcomeMessage();

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

      if (validateSpecResult.isCancelled() && !(await this.prompts.useDefaultSpecPrompt())) {
        return ActionResult.cancelled(
          "Good luck fixing your API definition! 🛠️  Feel free to run this command again once you're done."
        );
      }

      const selectedLanguages = await this.getSelectedLanguages();

      const buildDirectoryPath = await this.getBuildDirectoryPath();

      const setupBuildDirectory = await this.setupBuildDirectory(
        tempDirectory,
        specFilePathResult.value!,
        selectedLanguages,
        buildDirectoryPath,
        validateSpecResult.isCancelled()
      );

      if (setupBuildDirectory.isFailed()) {
        return ActionResult.error(setupBuildDirectory.error!);
      }

      const buildDirectory = new DirectoryPath(buildDirectoryPath, "src");
      const portalDirectory = new DirectoryPath(buildDirectoryPath, "portal");

      const generatePortalAction = new GenerateAction(this.configDir, null);
      const portalServeAction = new PortalServeAction(
        new PortalServePrompts(),
        new ServeHandler(),
        new PortalService()
      );

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
        generatePortalAction.execute
      );

      if (servePortalResult.isFailed()) {
        return ActionResult.error(servePortalResult.error!);
      }

      if (servePortalResult.isCancelled()) {
        return ActionResult.cancelled(servePortalResult.value!);
      }

      return ActionResult.success(buildDirectoryPath);
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
      if (isValidUrl(specPath)) {
        const response = await axios.get(specPath, { responseType: "stream" });

        if (response.status !== 200) {
          return Result.failure(
            "Unable to download the API Definition. Please verify that the provided URL is correct and publicly accessible. "
          );
        }

        const specFilePath = new FilePath(tempDirectory, new FileName(path.basename(specPath)));
        await this.fileService.writeFile(specFilePath, response.data as NodeJS.ReadableStream); // Add to spec folder first?
        return Result.success(specFilePath);
      } else {
        const normalizedSpecPath = path.normalize(specPath);
        const fileType = await filetype.fromFile(normalizedSpecPath);
        const specFileDirectory = new DirectoryPath(path.dirname(normalizedSpecPath));
        const specFileName = new FileName(path.basename(normalizedSpecPath));
        const specFilePath = new FilePath(specFileDirectory, specFileName);

        if (fileType?.ext === "zip") {
          await this.zipService.unArchive(specFilePath, tempDirectory);
        } else {
          await this.fileService.copyToDirectory(specFilePath, tempDirectory);
        }

        return Result.success(specFilePath);
      }
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
    }

    return validationPassed
      ? Result.success("API Validation successful.")
      : Result.cancelled("Your API Definition is not valid.");
  }

  private async getSelectedLanguages(): Promise<string[]> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 3 of 4: Select programming languages`));

    return await this.prompts.selectLanguagesPrompt();
  }

  private async getBuildDirectoryPath() {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 4 of 4: Generate source files for Docs as Code`));
    return await this.prompts.buildDirectoryPathPrompt();
  }

  private async setupBuildDirectory(
    tempDirectory: DirectoryPath,
    specFilePath: FilePath,
    selectedLanguages: string[],
    buildDirectoryPath: string,
    useDefaultSpec: boolean = false
  ): Promise<Result<string, string>> {
    this.prompts.startProgressIndicator(getMessageInMagentaColor("Generating build directory ⚙️"));

    const buildDirectory = new DirectoryPath(buildDirectoryPath, "src");

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

    return Result.success(buildDirectoryPath);
  }
}
