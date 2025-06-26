import * as fs from "fs";
import * as path from "path";
import treeify from "treeify";
import { spinner, select, text, cancel, isCancel, outro, log, autocomplete } from "@clack/prompts";
import { getMessageInGreenColor, isValidUrl } from "../../../utils/utils.js";

export class PortalRecipePrompts {
  private readonly spin = spinner();

  public async recipeNamePrompt(): Promise<string> {
    const recipeName = await text({
      message: `Enter a name for your API Recipe:`,
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
      message: `APIMATIC-BUILD.json not found in "${buildDirectoryPath}".\nPlease enter the path to your build config file (relative to this directory):`,
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
      message: `Enter a name for the step you want to add to your API Recipe:`,
      defaultValue: defaultStepName,
      placeholder: defaultStepName
    });

    if (isCancel(stepName)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (stepName as string).trim();
  }

  public async stepTypeSelectionPrompt(): Promise<string> {
    const stepType = await select({
      message: `Select the type of step you want to add to your API Recipe:`,
      options: [
        { value: "content", label: "Content Step" },
        { value: "endpoint", label: "Endpoint Step" }
      ]
    });

    if (isCancel(stepType)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return stepType as string;
  }

  public async contentFilePathPrompt(): Promise<string> {
    const contentFilePath = await text({
      message: `Provide a local path or a public URL to the markdown file containing the content:`,
      validate: (path) => {
        if (!path) {
          return "Content file path cannot be empty. Please provide a valid file path or URL.";
        }

        if (isValidUrl(path)) {
          if (!path.endsWith(".md")) {
            return "The content file must be a markdown (.md) file. Please provide a valid file path or URL.";
          }
          return;
        }

        if (!path.endsWith(".md")) {
          return "The content file must be a markdown (.md) file. Please provide a valid file path or URL.";
        }
        if (fs.existsSync(path) && fs.statSync(path).isFile()) {
          return;
        }

        return "The specified path is neither a valid markdown file path nor a valid URL. Please provide a valid markdown file's path or URL.";
      }
    });

    if (isCancel(contentFilePath)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (contentFilePath as string).trim();
  }

  public async endpointGroupNamePrompt(endpointGroups: Map<string, string[]>): Promise<string> {
    // const endpointGroupName = await text({
    //   message: `Enter the endpoint group name:`,
    //   validate: (name) => {
    //     if (!name) {
    //       return "Endpoint group name cannot be empty. Please provide a name for the endpoint group.";
    //     }
    //   }
    // });
    const groupNames = Array.from(endpointGroups.keys()).map((name) => ({
      value: name,
      label: name,
    }));
    const endpointGroupName = await autocomplete({
      message: `Select the endpoint group name:`,
      options: groupNames,
    })

    if (isCancel(endpointGroupName)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (endpointGroupName as string).trim();
  }

  public async endpointNamePrompt(endpointGroups: Map<string, string[]>, endpointGroupName: string): Promise<string> {
    // const endpointName = await text({
    //   message: `Enter the name of the endpoint:`,
    //   validate: (name) => {
    //     if (!name) {
    //       return "Endpoint name cannot be empty. Please provide a name for the endpoint.";
    //     }
    //   }
    // });
    const endpointNames = endpointGroups.get(endpointGroupName);
    const endpointName = await autocomplete({
      message: `Select the name of the endpoint:`,
      options: endpointNames!.map((name) => ({
        value: name,
        label: name
      }))
    });

    if (isCancel(endpointName)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (endpointName as string).trim();
  }

  public async endpointDescriptionPrompt(): Promise<string> {
    const endpointDescription = await text({
      message: `Enter a description for the endpoint:`,
      validate: (description) => {
        if (!description) {
          return "Endpoint description cannot be empty. Please provide a description for the endpoint.";
        }
      }
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

  public async overwriteTailIncludesPrompt(): Promise<boolean> {
    const overwriteTailIncludes = await select({
      message: `Your build config file already contains the 'tailIncludes' property. Do you want to overwrite it?`,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    });

    if (isCancel(overwriteTailIncludes)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return overwriteTailIncludes === "yes";
  }

  public async overwriteApiRecipeInTocPrompt(): Promise<boolean> {
    const overwriteApiRecipeInToc = await select({
      message: `There is an API Recipe with the same name already present. Do you want to overwrite it?`,
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

  public displayRecipeGenerationSuccessMessage(recipePath: string) {
    log.step(`✅  Recipe has been added successfully!`);
    outro(`Generated recipe has been added to build directory at: ${recipePath}`);
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
      .map((line) => line.replace(/#.*/, (match) => getMessageInGreenColor(match)))
      .join("\n");

    log.step(coloredLogString);
  }

  public logError(error: string): void {
    outro(error);
  }
}
