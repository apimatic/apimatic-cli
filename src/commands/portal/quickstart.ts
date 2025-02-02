import { flags, Command } from "@oclif/command";
import { APIValidationExternalApisController, ApiValidationSummary, Client } from "@apimatic/sdk";
import { SDKClient } from "../../client-utils/sdk-client";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart";
import { PortalQuickstartController } from "../../controllers/portal/quickstart";
import { SpecFile } from "../../types/portal/quickstart";

export default class PortalQuickstart extends Command {
  static description = "Get started with generating static docs portal";

  static flags = {
    "auth-key": flags.string({
      description: "override current authentication state with an authentication key"
    })
  };

  static examples = ['$ apimatic portal:quickstart --auth-key="yourAuthKey"'];

  private async getSpecFile(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController
  ): Promise<SpecFile> {
    const spec = await prompts.specPrompt();

    const specFile = await controller.getSpecFile(spec);

    prompts.displaySpecValidationMessage();

    return specFile;
  }

  private async getSpecValidationSummary(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController,
    specFile: SpecFile,
    apiValidationController: APIValidationExternalApisController
  ): Promise<ApiValidationSummary> {
    const apiValidationSummary = await controller.getSpecValidationSummary(specFile, apiValidationController);

    if (!apiValidationSummary.success) {
      prompts.displaySpecValidationFailureMessage();
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
    const directory = await prompts.buildDirectoryPrompt();

    prompts.displayBuildDirectoryGenerationMessage();

    await controller.setupBuildDirectory(directory, specFile, apiValidationSummary, languages);

    prompts.displayBuildDirectoryGenerationSuccessMessage(directory);

    prompts.displayBuildDirectoryAsTree(directory);

    return directory;
  }

  private async getGeneratedPortalPath(
    prompts: PortalQuickstartPrompts,
    controller: PortalQuickstartController,
    directory: string,
    overrideAuthKey: string | null
  ): Promise<string> {
    prompts.displayPortalGenerationMessage();

    const generatedPortalPath = await controller.generatePortalArtifacts(
      directory,
      this.config.configDir,
      overrideAuthKey
    );

    prompts.displayPortalGenerationSuccessMessage();

    return generatedPortalPath;
  }

  async run() {
    const { flags } = this.parse(PortalQuickstart);
    const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;

    const prompts = new PortalQuickstartPrompts();
    const controller = new PortalQuickstartController();

    //TODO: Fix double initialization of clients.
    const sdkClient: SDKClient = SDKClient.getInstance();

    prompts.displayWelcomeMessage();

    const loggedIn = await controller.isUserAuthenticated(overrideAuthKey, this.config.configDir);

    if (!loggedIn) {
      const credentials = await prompts.loginPrompt();

      prompts.displayLoggingInMessage();

      await controller.userLogin(credentials, sdkClient, this.config.configDir);

      prompts.displayLoggedInMessage();
    }

    //TODO: Fix double initialization of clients.
    const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
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

    const generatedPortalPath = await this.getGeneratedPortalPath(prompts, controller, directory, overrideAuthKey);

    controller.servePortal(generatedPortalPath, directory, this.config.configDir, overrideAuthKey);

    prompts.displayOutroMessage();
  }
}