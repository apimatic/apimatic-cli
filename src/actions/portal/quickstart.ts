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
import { isValidUrl, getMessageInOrangeColor } from "../../utils/utils.js";
import { PortalScaffoldService } from "../../infrastructure/services/portal-scaffold-service.js";
import { LoginAction } from "../auth/login.js";
import { Result } from "../../types/common/result.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { ActionResult } from "../action-result.js";
import { GenerateAction } from "./generate.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import getPort from "get-port";
import { PortalServeAction } from "./serve.js";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalScaffoldService: PortalScaffoldService = new PortalScaffoldService();
  private readonly portalService: PortalService = new PortalService();
  private readonly defaultSpecUrl: string =
    "https://github.com/apimatic/static-portal-workflow/blob/master/spec/openapi.json" as const;
  private readonly defaultPort: number = 3000 as const;

  public readonly execute = async (configDir: string): Promise<ActionResult> => {
    this.prompts.displayWelcomeMessage();

    const authenticateUserResult = await this.authenticateUser(configDir);

    if (authenticateUserResult.isFailed()) {
      return ActionResult.error(authenticateUserResult.error!);
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath) => {
      const specPath = await this.getSpecPath();

      const specFilePathResult = await this.setupSpecFile(tempDirectory, specPath);

      if (specFilePathResult.isFailed()) {
        return ActionResult.error(specFilePathResult.error!);
      }

      const validateSpecResult = await this.validateSpecFile(specFilePathResult.value!, configDir);
      if (validateSpecResult.isFailed() && !this.prompts.useDefaultSpecPrompt()) {
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
        buildDirectoryPath
      );

      if (setupBuildDirectory.isFailed()) {
        return ActionResult.error(setupBuildDirectory.error!);
      }

      const portalDirectoryPath = path.join(buildDirectoryPath, "portal");

      const portalServeAction = new PortalServeAction(
        new PortalServePrompts(),
        new ServeHandler(),
        new PortalService()
      );
      const generatePortalAction = new GenerateAction(new DirectoryPath(configDir), null);

      const serveFlags: ServeFlags = {
        input: buildDirectoryPath,
        destination: portalDirectoryPath,
        port: await this.getServerPort(this.defaultPort),
        open: true,
        "no-reload": false,
        "auth-key": undefined
      };

      const servePaths: ServePaths = {
        sourceDirectoryPath: buildDirectoryPath,
        destinationDirectoryPath: portalDirectoryPath
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

      this.prompts.displayOutroMessage(buildDirectoryPath.toString());

      return ActionResult.success(buildDirectoryPath);
    });
  };

  private async authenticateUser(configDir: string): Promise<Result<string, string>> {
    const isUserAuthenticated = await this.isUserAuthenticated(configDir);

    if (!isUserAuthenticated) {
      this.prompts.displayInfo("You need to be logged in to continue.");
      const loginAction = new LoginAction(new DirectoryPath(configDir));
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

  private async isUserAuthenticated(configDir: string): Promise<boolean> {
    const storedAuth = await getAuthInfo(configDir);
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
    if (isValidUrl(specPath)) {
      const response = await axios.get(specPath, { responseType: "stream" });

      if (response.status !== 200) {
        return Result.failure(
          "Unable to download your API Definition. Please verify that the provided URL is correct and publicly accessible. "
        );
      }

      const specFilePath = new FilePath(tempDirectory, new FileName(path.basename(specPath)));
      await this.fileService.writeFile(specFilePath, response.data as NodeJS.ReadableStream);
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
  }

  private async validateSpecFile(specFilePath: FilePath, configDir: string): Promise<Result<string, string>> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 2 of 4: Validate and Lint your OpenAPI file`));
    this.prompts.startProgressIndicator(
      `Running your API Definition through APIMatic's 1200+ CodeGen Specific validation and linting rules 🔍 `
    );
    const specFileStream = await this.fileService.getStream(specFilePath);
    let result: Result<ApiValidationSummary, string>;

    try {
      result = await this.portalService.validateSpec(specFileStream, configDir);
    } finally {
      specFileStream.close();
    }

    if (result.isFailed()) {
      return Result.failure(result.error!);
    }

    const validationPassed = result.value!.success;
    if (validationPassed) {
      this.prompts.stopProgressIndicator(`Validation Successful.`);
    } else {
      this.prompts.stopProgressIndicator(`❗ Oops, it looks like there are some errors in your API Definition.`);
    }

    return validationPassed
      ? Result.success("API Validation successful.")
      : Result.failure("Your API Definition is not valid.");
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
    buildDirectoryPath: string
  ): Promise<Result<string, string>> {
    this.prompts.startProgressIndicator("Gennerating build directory ⚙️");

    const buildDirectory = new DirectoryPath(buildDirectoryPath, "src");

    const scaffoldBuildDirectoryResult = await this.portalScaffoldService.scaffoldBuildDirectory(
      tempDirectory,
      buildDirectory,
      specFilePath,
      selectedLanguages
    );

    if (scaffoldBuildDirectoryResult.isFailed()) {
      return Result.failure(scaffoldBuildDirectoryResult.error!);
    }

    this.prompts.displayBuildDirectoryAsTree(buildDirectory.toString());

    return Result.success(buildDirectoryPath);
  }

  private async getServerPort(port: number | undefined): Promise<number> {
    const defaultPorts = [3000, 3001, 3002];

    const preferredPorts = typeof port === "number" ? [port, ...defaultPorts.filter((p) => p !== port)] : defaultPorts;

    return await getPort({ port: preferredPorts });
  }
}
