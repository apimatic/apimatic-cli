import { Command } from "@oclif/core";
import { APIValidationExternalApisController, ApiValidationSummary, Client } from "@apimatic/sdk";
import { SDKClient } from "../../client-utils/sdk-client";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart";
import { PortalQuickstartController } from "../../controllers/portal/quickstart";
import { SpecFile } from "../../types/portal/quickstart";
import { getMessageInRedColor } from "../../utils/utils";

export default class PortalQuickstart extends Command {
  static description = "Create your first API Portal using APIMatic’s Docs as Code offering.";

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
    apiValidationController: APIValidationExternalApisController
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

  private async getBuildDirectory(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController,
    specFile: SpecFile,
    apiValidationSummary: ApiValidationSummary,
    languages: string[]
  ): Promise<string> {
    const buildDirectoryPath = await prompts.buildDirectoryPrompt();

    prompts.displayBuildDirectoryGenerationMessage();

    await controller.setupBuildDirectory(prompts, buildDirectoryPath, specFile, apiValidationSummary, languages);

    prompts.displayBuildDirectoryGenerationSuccessMessage(buildDirectoryPath);

    prompts.displayBuildDirectoryAsTree(buildDirectoryPath);

    return buildDirectoryPath;
  }

  private async getGeneratedPortalPath(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController,
    directory: string
  ): Promise<string> {
    prompts.displayPortalGenerationMessage();

    const generatedPortalPath = await controller.generatePortalArtifacts(directory, this.config.configDir);

    prompts.displayPortalGenerationSuccessMessage();

    return generatedPortalPath;
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
      } catch (error) {
        prompts.displayLoggingInErrorMessage();
      }
    }

    const client: Client = await SDKClient.getInstance().getClient(null, this.config.configDir);
    const apiValidationController: APIValidationExternalApisController = new APIValidationExternalApisController(
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

      const directory = await this.getBuildDirectory(prompts, controller, specFile, apiValidationSummary, languages);

      const generatedPortalPath = await this.getGeneratedPortalPath(prompts, controller, directory);

      controller.servePortal(generatedPortalPath, directory, this.config.configDir);

      prompts.displayOutroMessage();
    } catch (error) {
      this.error(getMessageInRedColor(error instanceof Error ? error.message : String(error)));
    }
  }
}
