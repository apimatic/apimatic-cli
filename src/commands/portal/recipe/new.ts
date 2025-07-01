import * as path from "path";
import { Command, Flags } from "@oclif/core";
import { PortalRecipeAction } from "../../../actions/portal/recipe/new-recipe.js";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { getMessageInRedColor } from "../../../utils/utils.js";

const DEFAULT_FOLDER = process.cwd();
export default class PortalNewRecipe extends Command {
  static override description = "Generate an API Recipe for a static API Documentation portal.";
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
        "path to the build directory containing specs, content, and build config file. Defaults to the current working directory if not provided.",
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
    const portalRecipeAction = new PortalRecipeAction();
    const portalRecipePrompts = new PortalRecipePrompts();

    const createRecipeResult = await portalRecipeAction.createRecipe(
      flags.folder,
      this.config.configDir,
      flags["build-config"],
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
