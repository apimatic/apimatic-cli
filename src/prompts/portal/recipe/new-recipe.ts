import { select, text, isCancel, log, autocomplete, confirm, note } from "@clack/prompts";
import { Sdl, SdlEndpoint } from "../../../types/sdl/sdl.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { format as f, getTree, TreeNode, withSpinner } from "../../format.js";
import { StepType } from "../../../types/recipe/recipe.js";
import { getErrorMessage, ServiceError } from "../../../infrastructure/api-utils.js";
import { Result } from "neverthrow";

export class PortalRecipePrompts {
  public displayWelcomeMessage(): void {
    log.step(`Welcome to the API Recipe Generation Wizard.`);
    const message = `This wizard will guide you through the process of creating an API Recipe.

An API Recipe is a collection of steps that allows you to define a single use case for your API Documentation portal.
Learn more: ${f.link("https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/api-recipes")}

Let's get started!`;
    log.info(message);
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
    const message = `You can add:
1. Content Step: Display custom content, such as instructions or information related to your API.
2. Endpoint Step: Display an API endpoint, its playground and other relevant details.
Steps appear in the order you add them.
Let's proceed to adding steps to your API Recipe.`;
    log.message(message);
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

  public async endpointDescriptionPrompt(defaultDescription: string): Promise<string | undefined> {
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

  public invalidBuildDirectory(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public serviceError(serviceError: ServiceError) {
    log.error(getErrorMessage(serviceError));
  }

  public openRecipeMarkdownEditor() {
    log.step("Opening markdown editor for you to enter recipe content...");
  }

  public displayRecipeStructure(tocStructure: TreeNode) {
    const heading = `You can edit the following files to customize your API Recipe:\n`;
    const message  = getTree(tocStructure);
    log.info(heading + message);
  }

  public nextSteps() {
    const message = `Run the command '${f.cmdAlt(`apimatic`, 'portal', 'serve')}' to preview your documentation portal`;
    note(message, "Next Steps");
  }

  public generateSdl(fn: Promise<Result<Sdl, ServiceError>>) {
    return withSpinner(
      "Extracting endpoints",
      "Endpoints extracted",
      "Endpoints extraction failed",
      fn
    );
  }

  public recipeCreated() {
    log.info(`A new API Recipe has been created successfully.`);
  }
}
