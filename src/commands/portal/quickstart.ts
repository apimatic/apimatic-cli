import getPort from "get-port";
import { Command } from "@oclif/core";
import { ApiValidationExternalApisController, ApiValidationSummary, Client } from "@apimatic/sdk";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { PortalQuickstartController } from "../../controllers/portal/quickstart.js";
import { SpecFile } from "../../types/portal/quickstart.js";
import { getMessageInRedColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { PortalServeAction } from "../../actions/portal/serve.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { GenerateAction } from "../../actions/portal/generate.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { LoginAction } from "../../actions/auth/login.js";
import { TelemetryService } from "../../infrastructure/services/telemetry-service.js";
import { QuickstartInitiatedEvent } from "../../types/events/quickstart-initiated.js";
import { QuickstartCompletedEvent } from "../../types/events/quickstart-completed.js";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { createApiClient, createAuthorizationHeader } from "../../infrastructure/api-client-utils.js";

export default class PortalQuickstart extends Command {
  static description = "Create your first API Portal using APIMatic's Docs as Code offering.";

  static examples = ["apimatic portal:quickstart"];

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

    const buildDirectory = new DirectoryPath(workingDirectory, "src").toString();

    await controller.setupBuildDirectory(prompts, buildDirectory, specFile, apiValidationSummary, languages);

    prompts.displayBuildDirectoryGenerationSuccessMessage(buildDirectory);

    prompts.displayBuildDirectoryAsTree(buildDirectory);

    return workingDirectory;
  }

  async run() {
    const prompts = new PortalQuickstartPrompts();
    const controller = new PortalQuickstartController();
    const telemetryService = new TelemetryService(this.config.configDir);

    await telemetryService.trackEvent(new QuickstartInitiatedEvent());
    prompts.displayWelcomeMessage();

    let loggedIn = await controller.isUserAuthenticated(this.config.configDir);

    if (!loggedIn) {
      prompts.getLoggedInFirst();
      const loginAction = new LoginAction(new DirectoryPath(this.config.configDir));
      const loginResult = await loginAction.execute();

      loginResult.match(
        (e) => prompts.displayLoggedInMessage(e),
        (error) => prompts.logError(error)
      );

      if (loginResult.isErr()) return;
    }

    const authInfo: AuthInfo | null = await getAuthInfo(this.config.configDir);
    const authorizationHeader = createAuthorizationHeader(authInfo, null);
    const client: Client = createApiClient(authorizationHeader, this.config.shell, 0);
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

      const buildDirectory = new DirectoryPath(workingDirectory, "src");
      const portalDirectory = new DirectoryPath(workingDirectory, "portal");

      const generatePortalAction = new GenerateAction(new DirectoryPath(this.config.configDir), null);

      const serveFlags: ServeFlags = {
        folder: buildDirectory.toString(),
        destination: portalDirectory.toString(),
        port: port,
        open: true,
        "no-reload": false,
        "auth-key": undefined
      };

      const serverPaths: ServePaths = {
        sourceDirectoryPath: buildDirectory.toString(),
        destinationDirectoryPath: portalDirectory.toString()
      };

      const servePortalResult = await portalServeAction.servePortal(
        serveFlags,
        serverPaths,
        PortalQuickstart.id,
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
      await telemetryService.trackEvent(new QuickstartCompletedEvent());
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
