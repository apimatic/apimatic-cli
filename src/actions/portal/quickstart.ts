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
import { getMessageInCyanColor, getMessageInMagentaColor, getMessageInOrangeColor } from "../../utils/utils.js";
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
import { SpecPathFactory } from "../../types/file/spec-path.js";
import { FileName } from "../../types/file/fileName.js";

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalScaffoldService: PortalScaffoldService = new PortalScaffoldService();
  private readonly validationService: ValidationService = new ValidationService();
  private readonly defaultSpecUrl: UrlPath = new UrlPath(
    "https://raw.githubusercontent.com/apimatic/static-portal-workflow/refs/heads/master/spec/openapi.json"
  );
  private readonly defaultPort: number = 3000 as const;
  private readonly configDir: DirectoryPath;

  constructor(configDir: DirectoryPath) {
    this.configDir = configDir;
  }

  public readonly execute = async (commandName: string): Promise<ActionResult> => {
    this.prompts.displayWelcomeMessage();

    const authenticateUserResult = await this.authenticateUser(this.configDir);
    if (authenticateUserResult.isFailed()) {
      return ActionResult.error(authenticateUserResult.error!);
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath) => {
      // Step 1/4
      const specFilePathResult = await this.setupSpecFile(tempDirectory);
      if (specFilePathResult.isFailed()) {
        return ActionResult.error(specFilePathResult.error!);
      }

      // Step 2/4
      const validateSpecResult = await this.validateSpecFile(specFilePathResult.value!, this.configDir);
      if (validateSpecResult.isFailed()) {
        return ActionResult.error(validateSpecResult.error!);
      }

      // Step 3/4
      const selectedLanguages = await this.selectLanguages();

      // Step 4/4
      const buildDirectoryPath = await this.promptForBuildDirectory();

      // Setup build directory.
      const sourceDirectory = buildDirectoryPath.join("src");
      const portalDirectory = buildDirectoryPath.join("portal");

      const buildDirectoryResult = await this.setupBuildDirectory(
        tempDirectory,
        specFilePathResult.value!,
        sourceDirectory,
        selectedLanguages
      );
      if (buildDirectoryResult.isFailed()) {
        return ActionResult.error(buildDirectoryResult.error!);
      }

      // Generate portal and serve
      const generateAndServePortalResult = await this.generateAndServePortal(
        sourceDirectory,
        portalDirectory,
        commandName
      );
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
    this.prompts.displaySuccess(loginResult.value);
    return Result.success("Authentication was successful.");
  }

  private async setupSpecFile(tempDirectory: DirectoryPath): Promise<Result<DirectoryPath, string>> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 1 of 4: Import your OpenAPI Definition`));
    const specPath = await this.prompts.specPathPrompt(this.defaultSpecUrl);
    const spec = SpecPathFactory.create(specPath);
    const userSpecDirectory = tempDirectory.join("user-spec");

    try {
      if (spec instanceof UrlPath) {
        const response = await axios.get(spec.toString(), { responseType: "stream" });

        if (response.status !== 200) {
          return Result.failure(
            "Unable to download the API Definition. Please verify that the provided URL is correct and publicly accessible. "
          );
        }

        const specFilePath = new FilePath(userSpecDirectory, spec.fileName());
        await this.fileService.writeFile(specFilePath, response.data as NodeJS.ReadableStream);

        const fileType = await filetype.fromFile(specFilePath.toString());
        if (fileType?.ext === "zip") {
          await this.zipService.unArchive(specFilePath, userSpecDirectory);
        }
        return Result.success(userSpecDirectory);
      }

      const fileType = await filetype.fromFile(spec.toString());
      if (fileType?.ext === "zip") {
        await this.zipService.unArchive(spec, userSpecDirectory);
      } else {
        await this.fileService.copyToDirectory(spec, userSpecDirectory);
      }

      return Result.success(userSpecDirectory);
    } catch {
      return Result.failure(
        "Something went wrong while setting up the API Definition. Please try again later. If the issue persists, contact our team at support@apimatic.io"
      );
    }
  }

  private async validateSpecFile(
    specFilePath: DirectoryPath,
    configDir: DirectoryPath
  ): Promise<Result<string, string>> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 2 of 4: Validate and Lint your OpenAPI file`));
    this.prompts.startProgressIndicator(
      getMessageInMagentaColor(
        `Running your API Definition through APIMatic's 1200+ CodeGen Specific validation and linting rules 🔍 `
      )
    );
    const specZipFilePath = new FilePath(specFilePath, new FileName("spec.zip"));
    await this.zipService.archive(specFilePath, new FilePath(specFilePath, new FileName("spec.zip")));

    const specFileStream = await this.fileService.getStream(specZipFilePath);
    let result: Result<ApiValidationSummary, string>;

    try {
      result = await this.validationService.validateSpec(specFileStream, configDir);
    } finally {
      specFileStream.close();
      await this.fileService.deleteFile(specZipFilePath);
    }
    // TODO: Add spinner when refactoring
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

  private async selectLanguages(): Promise<string[]> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 3 of 4: Select programming languages`));

    return await this.prompts.selectLanguagesPrompt();
  }

  private async promptForBuildDirectory(): Promise<DirectoryPath> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 4 of 4: Generate source files for Docs as Code`));

    return new DirectoryPath(await this.prompts.buildDirectoryPathPrompt());
  }

  private async setupBuildDirectory(
    tempDirectory: DirectoryPath,
    specFileDirectory: DirectoryPath,
    sourceDirectory: DirectoryPath,
    selectedLanguages: string[]
  ): Promise<Result<DirectoryPath, string>> {
    this.prompts.startProgressIndicator(getMessageInMagentaColor("Generating build directory ⚙️"));

    const scaffoldBuildDirectoryResult = await this.portalScaffoldService.scaffoldBuildDirectory(
      tempDirectory,
      sourceDirectory,
      specFileDirectory,
      selectedLanguages
    );

    if (scaffoldBuildDirectoryResult.isFailed()) {
      this.prompts.stopProgressIndicator(`Something went wrong while setting up your build directory.`, 1);
      return Result.failure(scaffoldBuildDirectoryResult.error!);
    }

    this.prompts.stopProgressIndicator(getMessageInCyanColor(`📁 Directory created at ${sourceDirectory.toString()}`));

    this.prompts.displayBuildDirectoryAsTree(sourceDirectory.toString());

    return Result.success(sourceDirectory);
  }

  private async generateAndServePortal(
    sourceDirectory: DirectoryPath,
    portalDirectory: DirectoryPath,
    commandName: string
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
