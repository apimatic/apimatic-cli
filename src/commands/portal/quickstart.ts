import getPort from "get-port";
import { Command } from "@oclif/core";
import { ApiValidationExternalApisController, ApiValidationSummary, Client } from "@apimatic/sdk";
import { SDKClient } from "../../client-utils/sdk-client.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { PortalQuickstartController } from "../../controllers/portal/quickstart.js";
import { SpecFile } from "../../types/portal/quickstart.js";
import { getMessageInRedColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { PortalServeAction } from "../../actions/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { GeneratePortalAction } from "../../actions/portal/generatePortalAction.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";

export default class PortalQuickstart extends Command {
  static description = "Create your first API Portal using APIMatic's Docs as Code offering.";

  static examples = ["$ apimatic portal:quickstart"];

  private async getSpecFile(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController
  ): Promise<SpecFile> {
    const specPath = await prompts.specPrompt();

    const specFile = await controller.getSpecFile(specPath);

    prompts.displaySpecValidationMessage();

    return specFile;
  }

  private async getSpecValidationSummary(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController,
    specFile: SpecFile,
    apiValidationController: ApiValidationExternalApisController
  ): Promise<ApiValidationSummary> {
    const apiValidationSummary = await controller.getSpecValidationSummary(prompts, specFile, apiValidationController);

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
    controller: PortalQuickstartController,
    specFile: SpecFile,
    apiValidationSummary: ApiValidationSummary,
    languages: string[]
  ): Promise<string> {
    const workingDirectory = await prompts.workingDirectoryPrompt();

    prompts.displayBuildDirectoryGenerationMessage();

    const buildDirectory = new DirectoryPath(workingDirectory, "build").toString();

    await controller.setupBuildDirectory(prompts, buildDirectory, specFile, apiValidationSummary, languages);

    prompts.displayBuildDirectoryGenerationSuccessMessage(buildDirectory);

    prompts.displayBuildDirectoryAsTree(buildDirectory);

    return workingDirectory;
  }

  async run() {
    const prompts = new PortalQuickstartPrompts();
    const controller = new PortalQuickstartController();

    prompts.displayWelcomeMessage();

    let loggedIn = await controller.isUserAuthenticated(this.config.configDir);

    while (!loggedIn) {
      const credentials = await prompts.loginPrompt();

      prompts.displayLoggingInMessage();

      try {
        await controller.userLogin(credentials, SDKClient.getInstance(), this.config.configDir);
        loggedIn = true;
        prompts.displayLoggedInMessage();
      } catch {
        prompts.displayLoggingInErrorMessage();
      }
    }

    const client: Client = await SDKClient.getInstance().getClient(null, this.config.configDir);
    const apiValidationController: ApiValidationExternalApisController = new ApiValidationExternalApisController(
      client
    );

    try {
      const specFile = await this.getSpecFile(prompts, controller);

      const apiValidationSummary = await this.getSpecValidationSummary(
        prompts,
        controller,
        specFile,
        apiValidationController
      );

      const languages = await prompts.sdkLanguagesPrompt();

      const workingDirectory = await this.getWorkingDirectory(
        prompts,
        controller,
        specFile,
        apiValidationSummary,
        languages
      );

      const portalServePrompts = new PortalServePrompts();
      const portalServeAction = new PortalServeAction(portalServePrompts, new ServeHandler(), new PortalService());

      //TODO: This needs to be moved within the action. Port should not be initialized again here.
      const port = await this.getServerPort(3000);

      const buildDirectory = new DirectoryPath(workingDirectory, "build");
      const portalDirectory = new DirectoryPath(workingDirectory, "portal");

      const generatePortalAction = new GeneratePortalAction(new DirectoryPath(this.config.configDir), null);

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
    } catch (error) {
      this.error(getMessageInRedColor(error instanceof Error ? error.message : String(error)));
    }
  }

  private async getServerPort(port: number | undefined): Promise<number> {
    const defaultPorts = [3000, 3001, 3002];

    const preferredPorts = typeof port === "number" ? [port, ...defaultPorts.filter((p) => p !== port)] : defaultPorts;

    return await getPort({ port: preferredPorts });
  }
}
