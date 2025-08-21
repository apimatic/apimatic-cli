import { Command, Flags } from "@oclif/core";
import { PortalRecipeAction } from "../../../actions/portal/recipe/new-recipe.js";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { getMessageInRedColor } from "../../../utils/utils.js";
import { TelemetryService } from "../../../infrastructure/services/telemetry-service.js";
import { RecipeCreationFailedEvent } from "../../../types/events/recipe-creation-failed.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { FlagsProvider } from "../../../types/flags-provider.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalRecipeNew extends Command {
  static override summary = "Add an API Recipe to your API Documentation portal.";

  static override description =
    "To learn more about API Recipes, visit: https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/api-recipes";

  static override examples = [
    `apimatic portal recipe new`,
    `apimatic portal recipe new --name="My API Recipe" --input="./"`
  ];
  static override flags = {
    name: Flags.string({ description: "name for the recipe" }),
    ...FlagsProvider.input
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(PortalRecipeNew);
    const commandMetadata: CommandMetadata = {
      commandName: PortalRecipeNew.id,
      shell: this.config.shell
    };
    const telemetryService = new TelemetryService(this.config.configDir);
    const portalRecipeAction = new PortalRecipeAction(this.getConfigDir(), commandMetadata);
    const portalRecipePrompts = new PortalRecipePrompts();

    const workingDirectory = new DirectoryPath(flags.input ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = flags.input ? new DirectoryPath(flags.input, "src") : workingDirectory.join("src");

    const createRecipeResult = await portalRecipeAction.createRecipe(buildDirectory, flags.name);

    //TODO: Add a mapper for automatically mapping events to logger and telemetry service.
    if (createRecipeResult.isFailed()) {
      await telemetryService.trackEvent(
        new RecipeCreationFailedEvent(createRecipeResult.error!, PortalRecipeNew.id, flags),
        commandMetadata.shell
      );
      portalRecipePrompts.logError(getMessageInRedColor(createRecipeResult.error!));
    }
    if (createRecipeResult.isCancelled()) {
      portalRecipePrompts.logError(getMessageInRedColor(createRecipeResult.value!));
    }
  }

  private getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };
}
