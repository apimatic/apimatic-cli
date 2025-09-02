import treeify from "treeify";
import { select, text, isCancel, outro, log, autocomplete, confirm } from "@clack/prompts";
import { getMessageInGreenColor } from "../../../utils/utils.js";
import { SdlEndpoint } from "../../../types/sdl/sdl.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { format as f } from "../../format.js";
import { StepType } from "../../../types/recipe/recipe.js";

export class PortalRecipePrompts {
  public displayWelcomeMessage(): void {
    log.step(`Welcome to the API Recipe Generation Wizard.`);
    const message = `This wizard will guide you through the process of creating an API Recipe.

An API Recipe is a collection of steps that allows you to define a single use case for your API Documentation portal.
Learn more: ${f.link("https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/api-recipes")}
Let's get started!`;
    log.message(message);
  }

  public recipeNameEmpty() {
    const message = "No recipe name provided";
    log.error(message);
  }

  public contentFolderNotFound() {
    const message = "Content folder not found.";
    log.error(message);
  }

  public specFileEmptyInvalid() {
    const message = "Spec file is empty or invalid.";
    log.error(message);
  }

  public async recipeNamePrompt(): Promise<string | undefined> {
    const recipeName = await text({
      message: `Enter a name for your API Recipe:`,
      placeholder: "This name will be displayed in your API Documentation portal sidebar.",
      validate: (name) => {
        if (!name) {
          return "Recipe name cannot be empty. Please provide a name for your API Recipe.";
        }
      }
    });

    if (isCancel(recipeName)) {
      return undefined;
    }

    return (recipeName as string).trim();
  }

  public async stepNamePrompt(defaultStepName: string): Promise<string | undefined> {
    const stepName = await text({
      message: `Enter a name for the step:`,
      defaultValue: defaultStepName,
      placeholder: `Press enter to use the default, i.e. ${defaultStepName}`
    });

    if (isCancel(stepName)) {
      return undefined;
    }

    return (stepName as string).trim();
  }

  public displayStepsInformation(): void {
    log.step(`Add Steps to your API Recipe:`);
    log.message(`You can add:`);
    log.message(`1. Content Step: Display custom content, such as instructions or information related to your API.`);
    log.message(`2. Endpoint Step: Display an API endpoint, its playground and other relevant details.`);
    log.message(`Steps appear in the order you add them.`);
    log.message(`Let's proceed to adding steps to your API Recipe.`);
  }

  public async stepTypeSelectionPrompt(): Promise<StepType | undefined> {
    const stepType = await select({
      message: `Select the type of step you want to add:`,
      options: [
        { value: "content", label: "Content Step", hint: "For displaying custom content" },
        { value: "endpoint", label: "Endpoint Step", hint: "For displaying an API endpoint with its details" }
      ]
    });
    if (isCancel(stepType)) {
      return undefined;
    }
    return stepType as StepType;
  }

  public async endpointGroupNamePrompt(endpointGroups: Map<string, SdlEndpoint[]>): Promise<string | undefined> {
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
      return undefined;
    }

    return (endpointGroupName as string).trim();
  }

  public async endpointNamePrompt(
    endpointGroups: Map<string, SdlEndpoint[]>,
    endpointGroupName: string
  ): Promise<string | undefined> {
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
      return undefined;
    }

    return (endpointName as string).trim();
  }

  public async endpointDescriptionPrompt(
    defaultDescription: string,
  ): Promise<string | undefined> {
    const endpointDescription = await text({
      message: `Enter a description for the endpoint:`,
      placeholder: `Optional. Leave this empty to use the endpoint description defined in the API Specification`,
      defaultValue: defaultDescription
    });

    if (isCancel(endpointDescription)) {
      return undefined;
    }

    return (endpointDescription as string).trim();
  }

  public async addAnotherStepSelectionPrompt(): Promise<boolean> {
    const addAnotherStep = await confirm({
      message: `Do you want to add another step?`,
      initialValue: true
    });

    if (isCancel(addAnotherStep)) {
      return false;
    }
    return addAnotherStep;
  }

  public async overwriteApiRecipeInTocPrompt(name: string): Promise<boolean> {
    const overwrite = await confirm({
      message: `An API Recipe with name ${f.var(name)} already exists. Do you want to overwrite it?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }
    return overwrite;
  }

  public displayStepAddedSuccessfullyMessage() {
    log.step(`Step has been added successfully.`);
  }

  public displayBuildDirectoryStructureAsTree(buildDirectoryTreeObject: treeify.TreeObject) {
    const tree = treeify.asTree(buildDirectoryTreeObject, true, true);

    const coloredLogString = tree
      .split("\n")
      .map((line: string) => line.replace(/#.*/, (match: string) => getMessageInGreenColor(match)))
      .join("\n");

    log.step(`You can edit the following files to customize your API Recipe:\n\n` + coloredLogString);
  }

  public invalidBuildDirectory(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory.toString())}`;
    log.error(message);
  }

  public logError(error: string): void {
    outro(error);
  }

  public openRecipteMarkdownEditor() {
    log.step("Opening markdown editor for you to enter recipe content...");
  }
}
