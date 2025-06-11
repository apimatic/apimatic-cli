import { Command, Flags } from "@oclif/core";
import { PortalRecipeAction } from "../../../actions/portal/new/recipe";

const DEFAULT_FOLDER = "./";

export default class PortalNewRecipe extends Command {
  static override description =
    "Generate an API Recipe for a static API Documentation portal.";
  static override examples = ['$ apimatic portal:new:recipe --name="My API Recipe" --folder="./build-folder"', "$ apimatic portal:new:recipe"];
  static override flags = {
    name: Flags.string({ char: "n", description: "name for the recipe" }),
    folder: Flags.string({
      char: "d",
      description: "Build directory containing specs, content, and build file. By default, the current directory is used.",
      default: DEFAULT_FOLDER
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(PortalNewRecipe);
    const portalRecipeAction = new PortalRecipeAction();

    await portalRecipeAction.createRecipe(flags.folder, flags.name);
  }
}
