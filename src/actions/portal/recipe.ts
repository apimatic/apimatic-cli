import * as fs from "fs";
import { PortalRecipePrompts } from "../../prompts/portal/recipe";
import { StepType } from "../../types/portal/recipe";
import { isValidUrl } from "../../utils/utils";
import { Result } from "../../types/common/result";

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts;
  private readonly markdownFilePath = "resources/portal/api-recipe.md";
  private readonly scriptFilePath = "resources/portal/api-recipe.js";

  constructor() {
    this.prompts = new PortalRecipePrompts();
  }

  public async createRecipe(): Promise<void> {
    const recipeName = await this.prompts.recipeNamePrompt();
    await this.createMarkdownFile(recipeName);

    const stepType = await this.prompts.stepTypeSelectionPrompt();
    const stepName = await this.prompts.stepNamePrompt();
    switch (stepType) {
      case StepType.Content: {
        const contentFilePath = await this.prompts.contentFilePathPrompt();
        const content = isValidUrl(contentFilePath)
          ? this.fetchFileContentFromUrl(contentFilePath)
          : fs.readFileSync(contentFilePath, "utf-8");
        
      }
      case StepType.Endpoint: {
        const endpointGroupName = await this.prompts.endpointGroupNamePrompt();
        const endpointName = await this.prompts.endpointNamePrompt();
        const description = await this.prompts.endpointDescriptionPrompt();
      }
    }
  }

  private async createMarkdownFile(recipeName: string): Promise<void> {
    const directory = "content/api-recipes";
    const markdownFileContent = fs.readFileSync(this.markdownFilePath, "utf-8");

    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${directory}/${recipeName}.md`, markdownFileContent);
  }

  private async fetchFileContentFromUrl(url: string): Promise<Result<string, string>> {
    const response = await fetch(url);
    if (!response.ok) {
      Result.failure(`Failed to fetch content from URL: ${url}`);
    }
    const content = await response.text();
    return Result.success(content);
  }
}
