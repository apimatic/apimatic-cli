import getPort from "get-port";
import { ApiValidationSummary } from "@apimatic/sdk";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { SpecFile } from "../../types/portal/quickstart.js";
import { getMessageInRedColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { PortalServeAction } from "./serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { GeneratePortalAction } from "./generatePortalAction.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { staticPortalRepoUrl, metadataFileContent } from "../../config/env.js";
import fsExtra from "fs-extra";
import { simpleGit } from "simple-git";
import * as path from "path";
import { readdir } from "fs/promises";

export class QuickstartAction {
  constructor(
    private readonly configDir: string
  ) {}

  public async execute(): Promise<void> {
    const prompts = new PortalQuickstartPrompts();
    const portalService = new PortalService();

    prompts.displayWelcomeMessage();

    let loggedIn = await this.isUserAuthenticated(this.configDir);

    while (!loggedIn) {
      const credentials = await prompts.loginPrompt();
      prompts.displayLoggingInMessage();
      try {
        await portalService.userLogin(credentials, this.configDir);
        loggedIn = true;
        prompts.displayLoggedInMessage();
      } catch {
        prompts.displayLoggingInErrorMessage();
      }
    }

    const specFile = await this.getSpecFile(prompts, portalService);
    const apiValidationSummary = await this.getSpecValidationSummary(prompts, portalService, specFile);
    const languages = await prompts.sdkLanguagesPrompt();
    const workingDirectory = await this.getWorkingDirectory(prompts, portalService, specFile, apiValidationSummary, languages);
    const portalServePrompts = new PortalServePrompts();
    const portalServeAction = new PortalServeAction(portalServePrompts, new ServeHandler(), new PortalService());
    const port = await this.getServerPort(3000);
    const buildDirectory = new DirectoryPath(workingDirectory, "build");
    const portalDirectory = new DirectoryPath(workingDirectory, "portal");
    const generatePortalAction = new GeneratePortalAction(new DirectoryPath(this.configDir), null);
    const serveFlags: ServeFlags = {
      folder: buildDirectory.toString(),
      destination: portalDirectory.toString(),
      port: port,
      open: true,
      "no-reload": false,
      ignore: "",
      "auth-key": undefined
    };
    const serverPaths: ServePaths = {
      sourceDirectoryPath: buildDirectory.toString(),
      destinationDirectoryPath: portalDirectory.toString()
    };
    const servePortalResult = await portalServeAction.servePortal(
      serveFlags,
      serverPaths,
      generatePortalAction.execute
    );
    if (servePortalResult.isFailed()) {
      portalServePrompts.logError(getMessageInRedColor(servePortalResult.error!));
      return;
    }
    if (servePortalResult.isCancelled()) {
      portalServePrompts.logError(getMessageInRedColor(servePortalResult.value!));
      return;
    }
    prompts.displayOutroMessage(buildDirectory.toString());
  }

  private async getSpecFile(
    prompts: PortalQuickstartPrompts,
    portalService: PortalService
  ): Promise<SpecFile> {
    const specPath = await prompts.specPrompt();
    const specFile = await portalService.getSpecFile(specPath);
    prompts.displaySpecValidationMessage();
    return specFile;
  }

  private async getSpecValidationSummary(
    prompts: PortalQuickstartPrompts,
    portalService: PortalService,
    specFile: SpecFile
  ): Promise<ApiValidationSummary> {
    const apiValidationSummary = await portalService.getSpecValidationSummary(prompts, specFile, this.configDir, null);
    if (!apiValidationSummary.success) {
      prompts.displaySpecValidationFailureMessage();
      await prompts.specValidationFailurePrompt();
    } else {
      prompts.displaySpecValidationSuccessMessage();
    }
    return apiValidationSummary;
  }

  private async getWorkingDirectory(
    prompts: PortalQuickstartPrompts,
    portalService: PortalService,
    specFile: SpecFile,
    apiValidationSummary: ApiValidationSummary,
    languages: string[]
  ): Promise<string> {
    const workingDirectory = await prompts.workingDirectoryPrompt();
    prompts.displayBuildDirectoryGenerationMessage();
    const buildDirectory = new DirectoryPath(workingDirectory, "build").toString();
    await this.setupBuildDirectory(prompts, buildDirectory, specFile, apiValidationSummary, languages);
    prompts.displayBuildDirectoryGenerationSuccessMessage(buildDirectory);
    prompts.displayBuildDirectoryAsTree(buildDirectory);
    return workingDirectory;
  }

  private async isUserAuthenticated(configDir: string): Promise<boolean> {
    const storedAuth = await getAuthInfo(configDir);
    return !!storedAuth?.authKey;
  }

  private async setupBuildDirectory(
    prompts: PortalQuickstartPrompts,
    targetFolder: string,
    specFile: SpecFile,
    validationSummary: ApiValidationSummary,
    languages: string[]
  ): Promise<void> {
    const git = simpleGit();
    fsExtra.emptyDirSync(targetFolder);
    try {
      await git.clone(staticPortalRepoUrl, targetFolder);
    } catch (error) {
      prompts.displayBuildDirectoryGenerationErrorMessage();
      if (error instanceof Error) {
        if (error.message.includes("timed out")) {
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
    await this.clearDirectory(path.join(targetFolder, ".git"));
    await this.clearDirectory(path.join(targetFolder, ".github"));
    if (specFile.localPath && validationSummary.success) {
      const specFolder = path.join(targetFolder, "spec");
      await this.deleteFile(path.join(specFolder, "Apimatic-Calculator.json"));
      const files = await readdir(specFile.localPath);
      for (const file of files) {
        const srcPath = path.join(specFile.localPath, file);
        const destPath = path.join(specFolder, file);
        await fsExtra.copy(srcPath, destPath);
      }
    }
    const buildFilePath = path.join(targetFolder, "APIMATIC-BUILD.json");
    const buildFileContent = JSON.parse(fsExtra.readFileSync(buildFilePath, "utf8"));
    const languageConfig = languages.reduce((config, lang) => {
      config[lang] = {};
      return config;
    }, {} as { [key: string]: object });
    buildFileContent.generatePortal.languageConfig = languageConfig;
    fsExtra.writeFileSync(buildFilePath, JSON.stringify(buildFileContent, null, 2));
    const specFolder = path.join(targetFolder, "spec");
    const metadataFile = fsExtra.readdirSync(specFolder).find((file) => file.startsWith("APIMATIC-META"));
    if (!metadataFile) {
      const newMetadataFilePath = path.join(specFolder, "APIMATIC-META.json");
      fsExtra.writeFileSync(newMetadataFilePath, JSON.stringify(metadataFileContent, null, 2));
    }
  }

  private async clearDirectory(folderPath: string) {
    if (!fsExtra.existsSync(folderPath)) {
      return;
    }
    const files = await fsExtra.readdir(folderPath);
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      await this.deleteFile(filePath);
    }
    await this.deleteFile(folderPath);
  }

  private async deleteFile(filePath: string) {
    if (await fsExtra.pathExists(filePath)) {
      await fsExtra.remove(filePath);
    }
  }

  private async getServerPort(port: number | undefined): Promise<number> {
    const defaultPorts = [3000, 3001, 3002];
    const preferredPorts = typeof port === "number" ? [port, ...defaultPorts.filter((p) => p !== port)] : defaultPorts;
    return await getPort({ port: preferredPorts });
  }
} 