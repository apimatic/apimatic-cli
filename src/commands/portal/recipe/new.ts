import * as path from "path";
import { Command, Flags } from "@oclif/core";
import { PortalRecipeAction } from "../../../actions/portal/recipe/new-recipe.js";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { getMessageInRedColor } from "../../../utils/utils.js";
import { TelemetryService } from "../../../infrastructure/services/telemetry-service.js";
import { RecipeCreationFailedEvent } from "../../../application/tracking-events/recipe-creation-failed.js";

const DEFAULT_FOLDER = process.cwd();
export default class PortalNewRecipe extends Command {
  static override summary = "Generate an API Recipe for a static API Documentation portal.";

  static override description =
    "To learn more about API Recipes, visit: https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/api-recipes";

  static override examples = [
    `$ apimatic portal:recipe:new --name="My API Recipe" --folder="./build-folder" --build-config-file="./build-folder/APIMATIC-BUILD.json"
Generated recipe has been added to build directory at: C:/build-folder/`,
    `$ apimatic portal:recipe:new
Generated recipe has been added to build directory at: C:/`
  ];
  static override flags = {
    name: Flags.string({ description: "name for the recipe" }),
    folder: Flags.string({
      parse: async (input: string) => path.resolve(input),
      description:
        "path to the build directory containing the specs folder, content folder, and the build config file. Defaults to the current working directory if not provided.",
      default: DEFAULT_FOLDER
    }),
    "build-config": Flags.string({
      parse: async (input: string) => path.resolve(input),
      description:
        "path to the APIMATIC-BUILD.json file. Defaults to the APIMATIC-BUILD.json file in the build directory if not provided."
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(PortalNewRecipe);
    const telemetryService = new TelemetryService(this.config.configDir);
    const portalRecipeAction = new PortalRecipeAction();
    const portalRecipePrompts = new PortalRecipePrompts();

    const createRecipeResult = await portalRecipeAction.createRecipe(
      flags.folder,
      this.config.configDir,
      flags["build-config"],
      flags.name
    );

    //TODO: Add a mapper for automatically mapping events to logger and telemetry service.
    if (createRecipeResult.isFailed()) {
      telemetryService.trackEvent(new RecipeCreationFailedEvent(createRecipeResult.error!, flags));
      portalRecipePrompts.logError(getMessageInRedColor(createRecipeResult.error!));
    }
    if (createRecipeResult.isCancelled()) {
      portalRecipePrompts.logError(getMessageInRedColor(createRecipeResult.value!));
    }
  }
}
