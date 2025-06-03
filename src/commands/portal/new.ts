import { Args, Command, Flags } from "@oclif/core";
import { PortalRecipeAction } from "../../actions/portal/recipe";
import { PortalEntityType } from "../../types/portal/recipe";

export default class PortalNew extends Command {
  static override args = {
    type: Args.string({
      name: "type",
      required: true,
      description: "Type of portal entity to create i.e. `recipe` or `toc`)",
      options: Object.values(PortalEntityType) // restrict to valid types
    })
  };
  static override description =
    "Generate an API Recipe or Table of Contents (ToC) file for an API Documentation portal.";
  static override examples = ['$ apimatic portal:new recipe --name="My API Recipe"', "$ apimatic portal:new toc"];
  static override flags = {
    name: Flags.string({ char: "n", description: "name for the recipe" })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(PortalNew);
    const portalRecipeAction = new PortalRecipeAction();

    if (args.type === PortalEntityType.Recipe) {
      const recipeGenerationResult = await portalRecipeAction.createRecipe();
    }
  }
}
