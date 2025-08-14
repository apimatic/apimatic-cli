import path from "path";
import fs from "fs";
import fsExtra from "fs-extra";
import axios from "axios";
import filetype from "file-type";
import { ApiValidationSummary } from "@apimatic/sdk";
import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { metadataFileContent } from "../../config/env.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileName } from "../../types/file/fileName.js";
import { FilePath } from "../../types/file/filePath.js";
import {
  isValidUrl,
  getMessageInRedColor,
  clearDirectory,
  deleteFile,
  getMessageInOrangeColor
} from "../../utils/utils.js";
import { PortalScaffoldService } from "../../infrastructure/services/portal-scaffold-service.js";
import { LoginAction } from "../auth/login.js";
import { Result } from "../../types/common/result.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { ActionResult } from "../action-result.js";

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly portalScaffoldService: PortalScaffoldService = new PortalScaffoldService();
  private readonly portalService: PortalService = new PortalService();
  private readonly defaultSpecUrl: string =
    "https://github.com/apimatic/static-portal-workflow/blob/master/spec/openapi.json";

  public readonly execute = async (configDir: string): Promise<ActionResult> => {
    this.prompts.displayWelcomeMessage();

    const authenticateUserResult = await this.authenticateUser(configDir);

    if (authenticateUserResult.isFailed()) {
      return ActionResult.error(authenticateUserResult.error!);
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath) => {
      const specFilePathResult = await this.setupSpecFile(tempDirectory);

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

      const setupBuildDirectory = await this.setupBuildDirectory(selectedLanguages);

      return ActionResult.success();
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

  private async setupSpecFile(tempDirectory: DirectoryPath): Promise<Result<FilePath, string>> {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 1 of 4: Import your OpenAPI Definition`));
    const specPath = await this.prompts.specPathPrompt(this.defaultSpecUrl);

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

  private async setupBuildDirectory(selectedLanguages: string[]) {
    this.prompts.displayInfo(getMessageInOrangeColor(`Step 4 of 4: Generate source files for Docs as Code`));

    const buildDirectoryPath = await this.prompts.buildDirectoryPathPrompt();
  }

  private async downloadRepositoryFromGitHub(buildDirectory: DirectoryPath): Promise<void> {
    return await withDirPath(async (tempDirectory) => {
      await this.portalScaffoldService.setupRepository(tempDirectory, buildDirectory);
    });
  }

  private async setupBuildDirectory2(
    prompts: PortalQuickstartPrompts,
    targetFolder: string,
    specFile: SpecFile,
    validationSummary: ApiValidationSummary,
    languages: string[]
  ): Promise<void> {
    fsExtra.emptyDirSync(targetFolder);

    try {
      await this.downloadRepositoryFromGitHub(targetFolder);
    } catch (error) {
      prompts.displayBuildDirectoryGenerationErrorMessage();
      if (error instanceof Error) {
        if (error.message.includes("timed out") || error.message.includes("timeout")) {
          throw new Error(
            getMessageInRedColor(
              "The operation timed out while setting up the build directory. Please check your internet connection and try again."
            )
          );
        } else if (error.message.includes("Could not resolve host")) {
          throw new Error(
            getMessageInRedColor("Unable to resolve the host. Please check your network settings and try again.")
          );
        } else {
          throw new Error(getMessageInRedColor(`Failed to set up the build directory. ${error.message}`));
        }
      } else {
        throw new Error(getMessageInRedColor(`Failed to set up the build directory. ${error}`));
      }
    }

    await clearDirectory(path.join(targetFolder, ".github"));

    if (specFile.localPath && validationSummary.success) {
      const specFolder = path.join(targetFolder, "spec");
      await deleteFile(path.join(specFolder, "openapi.json"));

      const files = await fsExtra.readdir(specFile.localPath);
      for (const file of files) {
        const srcPath = path.join(specFile.localPath, file);
        const destPath = path.join(specFolder, file);
        await fsExtra.copy(srcPath, destPath);
      }
    }

    const buildFilePath = path.join(targetFolder, "APIMATIC-BUILD.json");
    const buildFileContent = JSON.parse(fs.readFileSync(buildFilePath, "utf8"));

    const languageConfig = languages.reduce((config, lang) => {
      config[lang] = {};
      return config;
    }, {} as { [key: string]: object });

    buildFileContent.generatePortal.languageConfig = languageConfig;

    fs.writeFileSync(buildFilePath, JSON.stringify(buildFileContent, null, 2));

    const specFolder = path.join(targetFolder, "spec");

    const metadataFile = fs.readdirSync(specFolder).find((file) => file.startsWith("APIMATIC-META"));

    if (!metadataFile) {
      const newMetadataFilePath = path.join(specFolder, "APIMATIC-META.json");
      fs.writeFileSync(newMetadataFilePath, JSON.stringify(metadataFileContent, null, 2));
    }
  }
}
