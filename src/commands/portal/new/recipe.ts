import { Command, Flags } from "@oclif/core";
import { PortalRecipeAction } from "../../../actions/portal/recipe";

export default class PortalNewRecipe extends Command {
  static override description =
    "Generate an API Recipe or Table of Contents (ToC) file for an API Documentation portal.";
  static override examples = ['$ apimatic portal:new:recipe --name="My API Recipe"', "$ apimatic portal:new:recipe"];
  static override flags = {
    name: Flags.string({ char: "n", description: "name for the recipe" }),
    destination: Flags.string({
      char: "d",
      description:
        "Build directory containing specs, content, and build file. By default, the current directory is used."
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(PortalNewRecipe);
    const portalRecipeAction = new PortalRecipeAction();

    await portalRecipeAction.createRecipe(flags.name, flags.destination);
  }
}
