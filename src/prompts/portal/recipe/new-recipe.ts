import * as fs from "fs";
import * as path from "path";
import treeify from "treeify";
import { intro, spinner, select, text, cancel, isCancel, outro, log, autocomplete } from "@clack/prompts";
import { getMessageInGreenColor } from "../../../utils/utils.js";
import { SdlEndpoint } from "../../../types/sdl/sdl.js";

export class PortalRecipePrompts {
  private readonly spin = spinner();

  public displayWelcomeMessage(): void {
    intro(`Welcome to the API Recipe Generation Wizard. 🪄`);
    log.step(`This wizard will guide you through the process of creating an API Recipe.`);
    log.message(
      `An API Recipe is a collection of steps that allows you to define a single use case for your API Documentation portal.`
    );
    log.message(
      `ℹ️  Learn more: https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/api-recipes`
    );
    log.message(`Let's get started! 🚀`);
  }

  public async recipeNamePrompt(): Promise<string> {
    const recipeName = await text({
      message: `📘 Enter a name for your API Recipe:`,
      placeholder: "There will be a tab in the navbar of your API Documentation portal of this name.",
      validate: (name) => {
        if (!name) {
          return "Recipe name cannot be empty. Please provide a name for your API Recipe.";
        }
      }
    });

    if (isCancel(recipeName)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (recipeName as string).trim();
  }

  public async buildConfigFilePathPrompt(buildDirectoryPath: string): Promise<string> {
    const buildConfigFilePath = await text({
      message: `⚠️ APIMATIC-BUILD.json is required and was not found in "${buildDirectoryPath}".\nPlease enter the path to your build config file (relative to this directory):`,
      validate: (filePath) => {
        if (!filePath) {
          return "Build config file path cannot be empty. Please provide a valid file path.";
        }

        if (!filePath.endsWith(".json")) {
          return "The content file must be a JSON (.json) file. Please provide a valid file path.";
        }

        const resolvedPath = path.resolve(buildDirectoryPath, filePath);
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
          return;
        }

        return "The specified path is either not a valid relative file path or it doesn't exist. Please provide a valid relative file path.";
      }
    });

    if (isCancel(buildConfigFilePath)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return path.resolve(buildDirectoryPath, (buildConfigFilePath as string).trim());
  }

  public async stepNamePrompt(defaultStepName: string): Promise<string> {
    const stepName = await text({
      message: `Enter a name for the step:`,
      defaultValue: defaultStepName,
      placeholder: `Press enter to use the default, i.e. ${defaultStepName}`
    });

    if (isCancel(stepName)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (stepName as string).trim();
  }

  public displayStepsInformation(): void {
    log.step(`🔧 Add Steps to your Recipe:`);
    log.message(`You can add:`)
    log.message(
      `1. 📄 Content Step: Display custom content, such as instructions or information related to your API.`
    );
    log.message(`2. 🔗 Endpoint Step: Display an API endpoint, its playground and other relevant details.`);
    log.message(`💡 Steps appear in the order you add them.`);
    log.message(`📝 Let's proceed to adding steps to your API Recipe. `);
  }

  public async stepTypeSelectionPrompt(): Promise<string> {
    const stepType = await select({
      message: `➕ Select the type of step you want to add:`,
      options: [
        { value: "content", label: "Content Step", hint: "For displaying custom content" },
        { value: "endpoint", label: "Endpoint Step", hint: "For displaying an API endpoint with its details" }
      ]
    });

    if (isCancel(stepType)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return stepType as string;
  }

  public displayContentStepInfo(): void {
    log.step("📝 Opening markdown editor for you to add content in...");
  }

  public async endpointGroupNamePrompt(endpointGroups: Map<string, SdlEndpoint[]>): Promise<string> {
    const groupNames = Array.from(endpointGroups.keys()).map((name) => ({
      value: name,
      label: name
    }));
    const endpointGroupName = await autocomplete({
      message: `Select the endpoint group name:`,
      maxItems: 10,
      options: groupNames
    });

    if (isCancel(endpointGroupName)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (endpointGroupName as string).trim();
  }

  public async endpointNamePrompt(endpointGroups: Map<string, SdlEndpoint[]>, endpointGroupName: string): Promise<string> {
    const endpoints = endpointGroups.get(endpointGroupName);
    const endpointName = await autocomplete({
      message: `Select the name of the endpoint:`,
      maxItems: 10,
      options: endpoints!.map((endpoint) => ({
        value: endpoint.Name,
        label: endpoint.Name
      }))
    });

    if (isCancel(endpointName)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (endpointName as string).trim();
  }

  public async endpointDescriptionPrompt(endpointGroups: Map<string, SdlEndpoint[]>, endpointGroupName: string, endpointName: string): Promise<string> {
    const defaultDescription = endpointGroups.get(endpointGroupName)!.find((e) => e.Name === endpointName)!.Description;
    const endpointDescription = await text({
      message: `Enter a description for the endpoint:`,
      placeholder: `Optional. Leave this empty to use the endpoint description defined in the API Specification`,
      defaultValue: defaultDescription
    });

    if (isCancel(endpointDescription)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (endpointDescription as string).trim();
  }

  public async addAnotherStepSelectionPrompt(): Promise<boolean> {
    const addAnotherStep = await select({
      message: `Do you want to add another step?`,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    });

    if (isCancel(addAnotherStep)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return addAnotherStep === "yes";
  }

  public async overwriteApiRecipeInTocPrompt(): Promise<boolean> {
    const overwriteApiRecipeInToc = await select({
      message: `⚠️  A recipe with this name already exists. Do you want to overwrite it?`,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    });

    if (isCancel(overwriteApiRecipeInToc)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return overwriteApiRecipeInToc === "yes";
  }

  public displayStepAddedSuccessfullyMessage() {
    log.step(`✅  Step has been added successfully.`);
  }

  public displayRecipeGenerationSuccessMessage(buildDirectoryPath: string) {
    log.message(`📦 Generated recipe has been added to build directory at: ${buildDirectoryPath}`);
    outro(
      `▶ Run the command 'apimatic portal:serve' to preview your documentation portal.`
    );
  }

  public startProgressIndicatorWithMessage(message: string): void {
    this.spin.start(message);
  }

  public stopProgressIndicatorWithMessage(message: string): void {
    this.spin.stop(message);
  }

  public displayBuildDirectoryStructureAsTree(buildDirectoryTreeObject: treeify.TreeObject) {
    const tree = treeify.asTree(buildDirectoryTreeObject, true, true);

    const coloredLogString = tree
      .split("\n")
      .map((line: string) => line.replace(/#.*/, (match: string) => getMessageInGreenColor(match)))
      .join("\n");

    log.step(`🛠️  You can edit the following files to customize your API Recipe :\n\n` + coloredLogString);
    log.message(`💡 Modify the TOC file to change the position of the API Recipes section in the navbar.`);
  }

  public logError(error: string): void {
    outro(error);
  }
}
