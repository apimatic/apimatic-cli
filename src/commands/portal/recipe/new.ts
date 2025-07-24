import { Command, Flags } from "@oclif/core";
import { PortalRecipeAction } from "../../../actions/portal/recipe/new-recipe.js";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { getMessageInRedColor } from "../../../utils/utils.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalRecipeNew extends Command {
  static override summary = "Generate an API Recipe for a static API Documentation portal.";

  static override description =
    "To learn more about API Recipes, visit: https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/api-recipes";

  static override examples = [
    `$ apimatic portal:recipe:new`,
    `$ apimatic portal:recipe:new --name="My API Recipe" --folder="./build-folder"`
  ];
  static override flags = {
    name: Flags.string({ description: "name for the recipe" }),
    folder: Flags.string({
      description:
        "[default: ./] Path to the parent directory containing the 'build' folder, which includes API specifications and configuration files."
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(PortalRecipeNew);
    const portalRecipeAction = new PortalRecipeAction();
    const portalRecipePrompts = new PortalRecipePrompts();

    const workingDirectory = new DirectoryPath(flags.folder ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = flags.folder ? new DirectoryPath(flags.folder, "build") : workingDirectory.join("build");

    const createRecipeResult = await portalRecipeAction.createRecipe(
      buildDirectory,
      this.config.configDir,
      flags.name
    );
    if (createRecipeResult.isFailed()) {
      portalRecipePrompts.logError(getMessageInRedColor(createRecipeResult.error!));
    }
    if (createRecipeResult.isCancelled()) {
      portalRecipePrompts.logError(getMessageInRedColor(createRecipeResult.value!));
    }
  }
}
