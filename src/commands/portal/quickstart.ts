import { Command } from "@oclif/command";
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
    const spec = await prompts.specPrompt();

    try {
      const specFile = await controller.getSpecFile(spec);

      prompts.displaySpecValidationMessage();

      return specFile;
    } catch (error) {
      throw new Error(getMessageInRedColor(`Something went wrong while setting up your spec file: ${error}`));
    }
  }

  private async getSpecValidationSummary(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController,
    specFile: SpecFile,
    apiValidationController: APIValidationExternalApisController
  ): Promise<ApiValidationSummary> {
    try {
      const apiValidationSummary = await controller.getSpecValidationSummary(specFile, apiValidationController);

      if (!apiValidationSummary.success) {
        prompts.displaySpecValidationFailureMessage();
        await prompts.specValidationFailurePrompt();
      } else {
        prompts.displaySpecValidationSuccessMessage();
      }

      return apiValidationSummary;
    } catch (error) {
      prompts.displaySpecValidationErrorMessage();
      throw new Error(
        getMessageInRedColor(
          `An error occurred while validating your spec. Please check if the path/URL is correct and points to a valid file.`
        )
      );
    }
  }

  private async getBuildDirectory(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController,
    specFile: SpecFile,
    apiValidationSummary: ApiValidationSummary,
    languages: string[]
  ): Promise<string> {
    try {
      const directory = await prompts.buildDirectoryPrompt();

      prompts.displayBuildDirectoryGenerationMessage();

      await controller.setupBuildDirectory(directory, specFile, apiValidationSummary, languages);

      prompts.displayBuildDirectoryGenerationSuccessMessage(directory);

      prompts.displayBuildDirectoryAsTree(directory);

      return directory;
    } catch (error) {
      throw new Error(getMessageInRedColor(`Something went wrong while setting up your build directory: ${error}`));
    }
  }

  private async getGeneratedPortalPath(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController,
    directory: string
  ): Promise<string> {
    try {
      prompts.displayPortalGenerationMessage();

      const generatedPortalPath = await controller.generatePortalArtifacts(directory, this.config.configDir);

      prompts.displayPortalGenerationSuccessMessage();

      return generatedPortalPath;
    } catch (error) {
      throw new Error(getMessageInRedColor(`Something went wrong while generating the portal: ${error}`));
    }
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
  }
}
