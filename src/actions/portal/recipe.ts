import * as fs from "fs";
import { PortalRecipePrompts } from "../../prompts/portal/recipe";
import { StepType } from "../../types/portal/recipe";
import { isValidUrl } from "../../utils/utils";
import { Result } from "../../types/common/result";
import { PortalRecipeBuilder } from "../../application/portal/recipe-builder";
import { PortalRecipeGenerator } from "../../application/portal/recipe-generator";
import { cwd } from "process";
import path = require("path");

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts;
  private readonly markdownFilePath = "resources/portal/api-recipe.md";

  constructor() {
    this.prompts = new PortalRecipePrompts();
  }

  public async createRecipe(): Promise<void> {
    const recipeName = await this.prompts.recipeNamePrompt();
    const recipeBuilder = new PortalRecipeBuilder(recipeName);
    const recipeGenerator = new PortalRecipeGenerator();
    await this.createMarkdownFile(recipeName);

    let idx: number = 1;
    let addAnotherStep = true;
    while (addAnotherStep) {
      const stepType = await this.prompts.stepTypeSelectionPrompt();
      const stepName = await this.prompts.stepNamePrompt("Step " + idx);
      switch (stepType) {
        case StepType.Content: {
          const contentFilePath = await this.prompts.contentFilePathPrompt();
          const contentResult = await this.getContentFromContentFilePath(contentFilePath);
          if (contentResult.isSuccess) {
            recipeBuilder.addContentStep(stepName, stepName, contentResult.value!);
            addAnotherStep = await this.prompts.addAnotherStepSelectionPrompt();
          } else {
            this.prompts.logError(contentResult.error!);
            break;
          }
        }
        case StepType.Endpoint: {
          const endpointGroupName = await this.prompts.endpointGroupNamePrompt();
          const endpointName = await this.prompts.endpointNamePrompt();
          const description = await this.prompts.endpointDescriptionPrompt();
          const endpointPermalink = await this.createPermalink([endpointGroupName, endpointName]);
          recipeBuilder.addEndpointStep(stepName, stepName, description, endpointPermalink, )
          addAnotherStep = await this.prompts.addAnotherStepSelectionPrompt();
        }
      }
      idx++;
    }

    const generatedRecipeScript = await recipeGenerator.createScriptFromRecipe(recipeBuilder.build());
    await recipeGenerator.saveRecipeToFile(generatedRecipeScript, path.join(cwd(), "content", "api-recipes", recipeName));
  }

  private async createPermalink(pathPieces: string[]): Promise<string> {
    return `$e${pathPieces.map(encodeURIComponent).join("/")}`;
  }

  private async createMarkdownFile(recipeName: string): Promise<void> {
    const directory = "content/api-recipes";
    const markdownFileContent = fs.readFileSync(this.markdownFilePath, "utf-8");

    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${directory}/${recipeName}.md`, markdownFileContent);
  }

  private async getContentFromContentFilePath(contentFilePath: string): Promise<Result<string, string>> {
    try {
      if (isValidUrl(contentFilePath)) {
        return await this.fetchFileContentFromUrl(contentFilePath);
      }

      return Result.success(await fs.promises.readFile(contentFilePath, "utf-8"));
    } catch (error) {
      return Result.failure(`Failed to read content from file path: ${(error as Error).message}`);
    }
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
