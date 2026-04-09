import { Command, Flags } from "@oclif/core";
import { PortalRecipeAction } from "../../../actions/portal/recipe/new-recipe.js";
import { TelemetryService } from "../../../infrastructure/services/telemetry-service.js";
import { RecipeCreationFailedEvent } from "../../../types/events/recipe-creation-failed.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { FlagsProvider } from "../../../types/flags-provider.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { format, intro, outro } from "../../../prompts/format.js";

export default class PortalRecipeNew extends Command {
  static summary = "Add an API Recipe to your API documentation portal.";

  static description = `This command adds a new API Recipe file to your documentation portal.

To learn more about API Recipes, visit:
${format.link(
  "https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/api-recipes"
)}`;

  static flags = {
    name: Flags.string({ description: "name for the recipe" }),
    ...FlagsProvider.input,
    ...FlagsProvider.force
  };

  static readonly cmdTxt = format.cmd("apimatic", "portal", "recipe", "new");
  static readonly examples = [
    `${this.cmdTxt}`,
    `${this.cmdTxt} ${format.flag("name", '"My API Recipe"')} ${format.flag("input", '"./"')}`
  ];

  async run(): Promise<void> {
    const {
      flags: { name, input, force }
    } = await this.parse(PortalRecipeNew);

    const workingDirectory = DirectoryPath.createInput(input);
    const buildDirectory = input ? new DirectoryPath(input, "src") : workingDirectory.join("src");

    const commandMetadata: CommandMetadata = {
      commandName: PortalRecipeNew.id,
      shell: this.config.shell
    };

    intro("New Recipe");
    const action = new PortalRecipeAction(new DirectoryPath(this.config.configDir), commandMetadata);
    const result = await action.execute(buildDirectory, name);
    outro(result);

    await result.mapAll(
      async () => {},
      async () => {
        const telemetryService = new TelemetryService(new DirectoryPath(this.config.configDir));
        await telemetryService.trackEvent(
          new RecipeCreationFailedEvent("error", PortalRecipeNew.id, {
            name,
            input,
            force
          }),
          commandMetadata.shell
        );
      },
      async () => {}
    );
  }
}
