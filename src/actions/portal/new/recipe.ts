import * as fs from "fs";
import * as fsExtra from "fs-extra";
import * as path from "path";
import { parse } from "yaml";
import { TreeObject } from "treeify";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe";
import { SerializableRecipe, StepType, DirectoryNode } from "../../../types/portal/recipe";
import { getMessageInRedColor, isValidUrl } from "../../../utils/utils";
import { Result } from "../../../types/common/result";
import { PortalRecipe } from "../../../application/portal/new/portal-recipe";
import { PortalRecipeGenerator } from "../../../application/portal/new/recipe-generator";

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts;
  private readonly BUILD_FILE_NAME: string = "APIMATIC-BUILD.json";

  constructor() {
    this.prompts = new PortalRecipePrompts();
  }

  public async createRecipe(
    buildDirectoryPath: string,
    buildConfigFilePath?: string,
    name?: string
  ): Promise<Result<string, string>> {
    const recipeName = name ?? (await this.prompts.recipeNamePrompt());
    const recipeFileName = this.createRecipeFileName(recipeName);

    const validateBuildDirectoryPathResult = await this.validateBuildDirectoryPath(buildDirectoryPath);
    if (!validateBuildDirectoryPathResult.isSuccess) {
      return Result.failure(
        getMessageInRedColor(`Unable to generate API Recipe: ${validateBuildDirectoryPathResult.error!}`)
      );
    }

    const validateBuildConfigFilePathResult = await this.validateBuildConfigFilePath(buildConfigFilePath);
    if (!validateBuildConfigFilePathResult.isSuccess) {
      return Result.failure(
        getMessageInRedColor(`Unable to generate API Recipe: ${validateBuildConfigFilePathResult}`)
      );
    }

    //TODO: Create a type for the build config and use that here instead of any.
    const resolvedBuildConfigFilePath = await this.getResolvedBuildConfigFilePath(
      buildDirectoryPath,
      buildConfigFilePath
    );
    const buildConfigResult = await this.parseBuildConfig(resolvedBuildConfigFilePath);
    if (!buildConfigResult.isSuccess) {
      return Result.failure(getMessageInRedColor(`Unable to generate API Recipe: ${buildConfigResult.error!}`));
    }

    const contentFolderPath = this.getContentFolderPath(buildConfigResult.value, buildDirectoryPath);
    const tocFilePath = path.join(contentFolderPath, "content", "toc.yml");
    //TODO: Replace any type of tocFileResult.value to concrete type.
    const tocFileResult = await this.parseTocFile(tocFilePath);
    if (!tocFileResult.isSuccess) {
      return Result.failure(getMessageInRedColor(`Unable to generate API Recipe: ${tocFileResult.error!}`));
    }

    const recipeAlreadyExists = this.checkRecipeAlreadyExists(tocFileResult.value, recipeName, recipeFileName);
    if (recipeAlreadyExists && !(await this.prompts.overwriteApiRecipeInTocPrompt())) {
      return Result.failure(getMessageInRedColor("Unable to generate API Recipe: Operation cancelled."));
    }

    const tailIncludesPropertyAlreadyExists = this.checkTailIncludesPropertyAlreadyExists(buildConfigResult.value);
    if (tailIncludesPropertyAlreadyExists) {
      if (!(await this.prompts.overwriteTailIncludesPrompt())) {
        return Result.failure(getMessageInRedColor("Unable to generate API Recipe: Operation cancelled."));
      }
    }

    const recipeResult = await this.promptUserAndBuildNewRecipe(recipeName);
    if (!recipeResult.isSuccess) {
      return Result.failure(getMessageInRedColor(`Unable to generate API Recipe: ${recipeResult.error!}`));
    }

    const recipeGenerator = new PortalRecipeGenerator();
    await recipeGenerator.createRecipe(
      recipeResult.value!,
      tocFileResult.value,
      tocFilePath,
      recipeName,
      recipeFileName,
      resolvedBuildConfigFilePath,
      contentFolderPath
    );

    const buildDirectoryStructure = await this.getBuildDirectoryStructure(contentFolderPath, recipeFileName);

    this.prompts.displayBuildDirectoryStructureAsTree(buildDirectoryStructure as TreeObject);
    this.prompts.displayRecipeGenerationSuccessMessage(contentFolderPath);
    return Result.success("Generated recipe successfully.");
  }

  private createRecipeFileName(recipeName: string): string {
    return recipeName.trim().split(" ").join("-");
  }

  private async validateBuildDirectoryPath(buildDirectoryPath: string): Promise<Result<string, string>> {
    if (!(await fsExtra.pathExists(buildDirectoryPath))) {
      return Result.failure(`Portal build input folder ${buildDirectoryPath} does not exist.`);
    }

    return Result.success("Portal build input folder path validated successfully.");
  }

  private async validateBuildConfigFilePath(buildConfigFilePath?: string): Promise<Result<string, string>> {
    if (buildConfigFilePath && !(await fsExtra.pathExists(buildConfigFilePath))) {
      return Result.failure(`Portal build config file ${buildConfigFilePath} does not exist.`);
    }

    return Result.success("Portal build config file path validated successfully.");
  }

  //TODO: Figure out a better way to do this without the while loop.
  private async promptUserAndBuildNewRecipe(recipeName: string): Promise<Result<SerializableRecipe, string>> {
    const recipe = new PortalRecipe(recipeName);
    let idx: number = 1;
    let addAnotherStep = true;
    while (addAnotherStep) {
      const stepType = await this.prompts.stepTypeSelectionPrompt();
      const stepName = await this.prompts.stepNamePrompt("Step " + idx);
      switch (stepType) {
        case StepType.Content: {
          const addContentStepResult = await this.promptUserAndAddContentStepToRecipe(recipe, stepName);
          if (!addContentStepResult.isSuccess) {
            return Result.failure(addContentStepResult.error!);
          }
          break;
        }
        case StepType.Endpoint: {
          await this.promptUserAndAddEndpointStepToRecipe(recipe, stepName);
          break;
        }
      }
      addAnotherStep = await this.prompts.addAnotherStepSelectionPrompt();
      idx++;
    }

    return Result.success(recipe.toSerializableRecipe());
  }

  private async promptUserAndAddContentStepToRecipe(
    recipe: PortalRecipe,
    stepName: string
  ): Promise<Result<string, string>> {
    const contentFilePath = await this.prompts.contentFilePathPrompt();
    const contentResult = await this.getContentFromContentFilePath(contentFilePath);
    if (contentResult.isSuccess) {
      recipe.addContentStep(stepName, stepName, contentResult.value!);
      this.prompts.displayStepAddedSuccessfullyMessage();
      return Result.success("Added content step successfully.");
    } else {
      return Result.failure(contentResult.error!);
    }
  }

  private async promptUserAndAddEndpointStepToRecipe(recipe: PortalRecipe, stepName: string): Promise<void> {
    const endpointGroupName = await this.prompts.endpointGroupNamePrompt();
    const endpointName = await this.prompts.endpointNamePrompt();
    const description = await this.prompts.endpointDescriptionPrompt();
    const endpointPermalink = await this.createPermalink([endpointGroupName, endpointName]);
    recipe.addEndpointStep(stepName, stepName, description, endpointPermalink);
    this.prompts.displayStepAddedSuccessfullyMessage();
  }

  //TODO: Replace any with concrete toc file object.
  private async parseTocFile(tocFilePath: string): Promise<Result<any, string>> {
    const tocContent = await fs.promises.readFile(tocFilePath, "utf-8");

    try {
      return Result.success(parse(tocContent));
    } catch (error) {
      return Result.failure(`Unable to parse TOC file:  ${(error as Error).message}`);
    }
  }

  private async createPermalink(pathPieces: string[]): Promise<string> {
    return `$e/${pathPieces.map(encodeURIComponent).join("/")}`;
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

  private async getResolvedBuildConfigFilePath(
    buildDirectoryPath: string,
    buildConfigFilePath?: string
  ): Promise<string> {
    if (!buildConfigFilePath) {
      const files = await fs.promises.readdir(buildDirectoryPath);
      const buildFileExists = files.find((file) => file === this.BUILD_FILE_NAME);
      if (!buildFileExists) {
        return await this.prompts.buildConfigFilePathPrompt();
      }

      return path.join(buildDirectoryPath, this.BUILD_FILE_NAME);
    }

    return buildConfigFilePath;
  }

  //TODO: Create a type for the build config and use that here instead of any.
  private async parseBuildConfig(buildConfigFilePath: string): Promise<Result<any, string>> {
    try {
      const fileData = await fs.promises.readFile(buildConfigFilePath, "utf-8");
      return Result.success(JSON.parse(fileData));
    } catch {
      return Result.failure(
        "There was an error parsing the build config file, please check your build config file and try again later."
      );
    }
  }

  private checkRecipeAlreadyExists(tocData: any, recipeName: string, recipeFileName: string): boolean {
    let apiRecipesGroup = tocData.toc?.find((item: any) => item.group === "API Recipes");
    if (!apiRecipesGroup) {
      return false;
    }

    // Check if recipe name or file name already exists
    const existingRecipe = apiRecipesGroup.items.find(
      (item: any) => item.page === recipeName || item.file === `api-recipes/${recipeFileName}.md`
    );
    if (existingRecipe) {
      return true;
    }

    return false;
  }

  private checkTailIncludesPropertyAlreadyExists(buildConfig: any): boolean {
    return buildConfig.generatePortal?.tailIncludes !== undefined;
  }

  private async getBuildDirectoryStructure(
    contentFolder: string,
    recipeFileName: string,
    parentPath = ""
  ): Promise<DirectoryNode> {
    const markdownFilePath = `content/api-recipes/${recipeFileName}.md`;
    const generatedRecipeScriptFilePath = `static/scripts/api-recipes/${recipeFileName}.js`;
    const descriptions: { [key: string]: string } = Object.entries({
      "APIMATIC-BUILD.json": "# Contains the 'tailIncludes' property, which registers your API recipe as a workflow",
      [markdownFilePath]: "# Markdown file with static placeholder text for your API recipe",
      "content/toc.yml": "# Contains the API Recipes group with a new page for your API recipe",
      [generatedRecipeScriptFilePath]: "# The generated recipe script file containing all of the steps"
    }).reduce((acc, [key, value]) => {
      acc[path.normalize(key)] = value;
      return acc;
    }, {} as { [key: string]: string });

    const directoryStructure: DirectoryNode = {};

    const items = fs.readdirSync(contentFolder);
    items.forEach(async (item) => {
      if (item === ".git") return; // Skip .git directory

      const itemPath = path.join(contentFolder, item);
      const relativePath = path.join(parentPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        const subdirectoryStructure = await this.getBuildDirectoryStructure(itemPath, recipeFileName, relativePath);

        const folderName = descriptions[path.normalize(relativePath)]
          ? `${item} : ${descriptions[path.normalize(relativePath)]}`
          : item;

        directoryStructure[folderName] = subdirectoryStructure;
      } else {
        directoryStructure[
          descriptions[path.normalize(relativePath)] ? `${item} : ${descriptions[path.normalize(relativePath)]}` : item
        ] = null;
      }
    });

    return directoryStructure;
  }

  //TODO: Replace type of buildConfig from any to actual BuildConfig type after creating it.
  private getContentFolderPath(buildConfig: any, buildDirectoryPath: string): string {
    const contentFolder = buildConfig.generatePortal?.contentFolder;
    if (contentFolder) {
      return path.join(buildDirectoryPath, contentFolder);
    }

    return buildDirectoryPath;
  }
}
