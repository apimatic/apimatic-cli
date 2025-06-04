import * as fs from "fs";
import { spinner, select, text, cancel, isCancel, outro } from "@clack/prompts";
import { isValidUrl } from "../../utils/utils";

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

    return (recipeName as string).trim().replace(" ", "-");
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

  public async endpointGroupNamePrompt(): Promise<string> {
    const endpointGroupName = await text({
      message: `Enter the endpoint group name:`,
      validate: (name) => {
        if (!name) {
          return "Endpoint group name cannot be empty. Please provide a name for the endpoint group.";
        }
      }
    });

    if (isCancel(endpointGroupName)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return (endpointGroupName as string).trim();
  }

  public async endpointNamePrompt(): Promise<string> {
    const endpointName = await text({
      message: `Enter the name of the endpoint:`,
      validate: (name) => {
        if (!name) {
          return "Endpoint name cannot be empty. Please provide a name for the endpoint.";
        }
      }
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
    const stepType = await select({
      message: `Do you want to add another step?`,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    });

    if (isCancel(stepType)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return stepType === "yes";
  }

  logError(error: string): void {
    outro(error);
  }
}
