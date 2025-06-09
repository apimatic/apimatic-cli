import * as fs from "fs";
import { PortalRecipePrompts } from "../../prompts/portal/recipe";
import { SerializableRecipe, StepType } from "../../types/portal/recipe";
import { isValidUrl } from "../../utils/utils";
import { Result } from "../../types/common/result";
import { PortalRecipeBuilder } from "../../application/portal/recipe-builder";
import { PortalRecipeGenerator } from "../../application/portal/recipe-generator";
import { cwd } from "process";
import path = require("path");
import { BuildConfig } from "../../types/portal/common/build-config";

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts;

  constructor() {
    this.prompts = new PortalRecipePrompts();
  }

  public async createRecipe(name: string | undefined): Promise<Result<string, string>> {
    const recipeName = name ?? (await this.prompts.recipeNamePrompt());
    const recipeBuilder = new PortalRecipeBuilder(recipeName);
    const recipeGenerator = new PortalRecipeGenerator();
    await this.createMarkdownFile(recipeName);

    const recipe = await this.buildNewRecipe(recipeBuilder);

    if (!recipe.isSuccess) {
      // this.prompts.logError(recipe.error!);
      return Result.failure(recipe.error!);
    }

    const generatedRecipeScript = await recipeGenerator.createScriptFromRecipe(recipe.value!);
    const destinationPath = path.join(cwd(), "static", "scripts", "api-recipes", recipeName + ".js");
    await recipeGenerator.saveRecipeToFile(generatedRecipeScript, destinationPath);

    const buildConfig = await this.parseAndDeserializeBuildConfig<BuildConfig>();
    if (!buildConfig.isSuccess) {
      // this.prompts.logError(buildConfig.error!);
      return Result.failure(buildConfig.error!);
    }

    const recipeRegistrationResult = await this.registerRecipeInBuildConfig(buildConfig.value!, recipeName);
    if (!recipeRegistrationResult.isSuccess) {
      return Result.failure(recipeRegistrationResult.error!);
    }

    return Result.success("Recipe generated successfully.");
  }

  private async buildNewRecipe(recipeBuilder: PortalRecipeBuilder): Promise<Result<SerializableRecipe, string>> {
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
            return Result.failure(contentResult.error!);
          }
        }
        case StepType.Endpoint: {
          const endpointGroupName = await this.prompts.endpointGroupNamePrompt();
          const endpointName = await this.prompts.endpointNamePrompt();
          const description = await this.prompts.endpointDescriptionPrompt();
          const endpointPermalink = await this.createPermalink([endpointGroupName, endpointName]);
          recipeBuilder.addEndpointStep(stepName, stepName, description, endpointPermalink);
          addAnotherStep = await this.prompts.addAnotherStepSelectionPrompt();
        }
      }
      idx++;
    }

    return Result.success(recipeBuilder.build());
  }

  private async registerRecipeInBuildConfig(
    buildConfig: BuildConfig,
    recipeName: string
  ): Promise<Result<void, string>> {
    const scriptReference = PortalRecipeAction.getRecipeScriptReferenceForTailIncludesProperty(recipeName);
    let tailIncludesContent = buildConfig.GeneratePortal.TailIncludes;
    // Initialize TailIncludes if it doesn't exist
    if (!tailIncludesContent) {
      tailIncludesContent = scriptReference;
    } else {
      // If it exists but is empty, just set it
      if (tailIncludesContent.trim() === "") {
        tailIncludesContent = scriptReference;
      } else {
        // If it has content, append the new script reference without extra newlines
        tailIncludesContent = buildConfig.GeneratePortal.TailIncludes.trim() + scriptReference;
      }
    }

    return await this.writeTailIncludesToBuildConfig(tailIncludesContent);
  }

  private async writeTailIncludesToBuildConfig(tailIncludes: string): Promise<Result<void, string>> {
    const directory = cwd();
    const files = await fs.promises.readdir(directory);
    const buildFile = files.find((file) => file.endsWith("APIMATIC-BUILD.json"));

    if (!buildFile) {
      return Result.failure("No APIMATIC-BUILD.json file found in the current directory");
    }

    const buildFilePath = path.join(directory, buildFile);
    const fileData = await fs.promises.readFile(buildFilePath, "utf-8");
    const buildConfig = JSON.parse(fileData);

    // Update only the TailIncludes property
    buildConfig.GeneratePortal.TailIncludes = tailIncludes;

    // Write back to file with proper formatting
    return Result.success(await fs.promises.writeFile(buildFilePath, JSON.stringify(buildConfig, null, 2)));
  }

  private async createPermalink(pathPieces: string[]): Promise<string> {
    return `$e${pathPieces.map(encodeURIComponent).join("/")}`;
  }

  private async createMarkdownFile(recipeName: string): Promise<void> {
    const directory = "content/api-recipes";
    const markdownFileContent = PortalRecipeAction.getMarkdownFileContent();

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
      return Result.failure(`Failed to fetch content from URL: ${url}`);
    }
    const content = await response.text();
    return Result.success(content);
  }

  private async parseAndDeserializeBuildConfig<T>(): Promise<Result<T, string>> {
    const directory = cwd();
    const files = await fs.promises.readdir(directory);
    const buildFile = files.find((file) => file.endsWith("APIMATIC-BUILD.json"));

    if (!buildFile) {
      return Result.failure("No APIMATIC-BUILD.json file found in the current directory");
    }

    const fileData = await fs.promises.readFile(path.join(directory, buildFile), "utf-8");
    return Result.success(JSON.parse(fileData) as T);
  }

  private static getMarkdownFileContent() {
    return `# This is a Guided Walkthrough File
This is the starter content`;
  }

  private static getRecipeScriptReferenceForTailIncludesProperty(recipeName: string): string {
    return `
      <script defer src='./static/scripts/api-recipes/${recipeName}.js'></script>
      <script>
        document.addEventListener('DOMContentLoaded', (event) => {
          APIMaticDevPortal.ready(({ registerWorkflow }) => {
            registerWorkflow(
              'page:api-recipes/${recipeName}',
              '${recipeName}',
              ${recipeName}
            );
          });
        });
      </script>
    `;
  }
}
