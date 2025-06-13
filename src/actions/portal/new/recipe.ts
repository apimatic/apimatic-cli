import * as fs from "fs";
import * as fsExtra from "fs-extra";
import * as path from "path";
import { parse, stringify } from "yaml";
import { TreeObject } from "treeify";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe";
import { SerializableRecipe, StepType, DirectoryNode } from "../../../types/portal/recipe";
import { getMessageInRedColor, isValidUrl } from "../../../utils/utils";
import { Result } from "../../../types/common/result";
import { PortalRecipeBuilder } from "../../../application/portal/new/recipe-builder";
import { PortalRecipeGenerator } from "../../../application/portal/new/recipe-generator";

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts;
  private readonly BUILD_FILE_NAME: string = "APIMATIC-BUILD.json";

  constructor() {
    this.prompts = new PortalRecipePrompts();
  }

  public async createRecipe(buildDirectoryPath: string, name?: string): Promise<Result<string, string>> {
    const recipeName = name ?? (await this.prompts.recipeNamePrompt());
    const recipeFileName = recipeName.split(" ").join("");
    const recipeBuilder = new PortalRecipeBuilder(recipeName);
    const recipeGenerator = new PortalRecipeGenerator();

    const validationResult = await this.validateBuildDirectoryPath(buildDirectoryPath);
    if (!validationResult.isSuccess) {
      this.prompts.logError(getMessageInRedColor(`Unable to generate API Recipe: ${validationResult.error!}`));
      return Result.failure(`Unable to generate API Recipe.`);
    }

    //TODO: Create a type for the build config and use that here instead of any.
    const buildConfigResult = await this.parseBuildConfig(buildDirectoryPath);
    if (!buildConfigResult.isSuccess) {
      this.prompts.logError(getMessageInRedColor(`Unable to generate API Recipe: ${buildConfigResult.error!}`));
      return Result.failure(`Unable to generate API Recipe.`);
    }

    const contentFolderPath = this.getContentFolderPath(buildConfigResult.value, buildDirectoryPath);
    const recipeResult = await this.promptUserAndBuildNewRecipe(recipeBuilder);
    if (!recipeResult.isSuccess) {
      this.prompts.logError(getMessageInRedColor(`Unable to generate API Recipe: ${recipeResult.error!}`));
      return Result.failure(`Unable to generate API Recipe.`);
    }

    const tocFilePath = path.join(contentFolderPath, "content", "toc.yml");
    const tocFileResult = await this.parseTocFile(tocFilePath);
    if (!tocFileResult.isSuccess) {
      this.prompts.logError(getMessageInRedColor(`Unable to generate API Recipe: ${tocFileResult.error!}`));
      return Result.failure(`Unable to generate API Recipe.`);
    }

    const recipeAlreadyExists = this.checkRecipeAlreadyExists(tocFileResult.value!, recipeName, recipeFileName);
    if (recipeAlreadyExists) {
      if (!(await this.prompts.overwriteApiRecipeInTocPrompt())) {
        this.prompts.logError(getMessageInRedColor("Unable to generate API Recipe: Operation cancelled."));
        return Result.failure("Unable to generate API Recipe: Operation cancelled.");
      }
    }

    const tailIncludesPropertyAlreadyExists = this.checkTailIncludesPropertyAlreadyExists(buildConfigResult.value!);
    if (tailIncludesPropertyAlreadyExists) {
      if (!(await this.prompts.overwriteTailIncludesPrompt())) {
        this.prompts.logError(getMessageInRedColor("Unable to generate API Recipe: Operation cancelled."));
        return Result.failure("Unable to generate API Recipe: Operation cancelled.");
      }
    }

    if (!recipeAlreadyExists) {
      await this.addRecipeToToc(tocFileResult.value, tocFilePath, recipeName, recipeFileName);
    }
    await this.registerRecipeInBuildConfig(recipeName, recipeFileName, buildDirectoryPath);
    await this.createMarkdownFile(recipeFileName, contentFolderPath);

    const generatedRecipeScript = await recipeGenerator.createScriptFromRecipe(recipeResult.value!);
    const generatedRecipeScriptsDirectoryPath = path.join(contentFolderPath, "static", "scripts", "api-recipes");
    await recipeGenerator.saveGeneratedRecipeScriptToBuildDirectory(
      generatedRecipeScript,
      generatedRecipeScriptsDirectoryPath,
      recipeFileName
    );

    const buildDirectoryStructure = await this.getBuildDirectoryStructure(contentFolderPath, recipeFileName);

    this.prompts.displayBuildDirectoryStructureAsTree(buildDirectoryStructure as TreeObject);
    this.prompts.displayRecipeGenerationSuccessMessage(contentFolderPath);
    return Result.success("Generated recipe successfully.");
  }

  private async validateBuildDirectoryPath(buildDirectoryPath: string): Promise<Result<string, string>> {
    if (!(await fsExtra.pathExists(buildDirectoryPath))) {
      return Result.failure(`Portal build input folder ${buildDirectoryPath} does not exist.`);
    }

    return Result.success("Portal build input folder validated successfully.");
  }

  //TODO: Figure out a better way to do this without the while loop.
  private async promptUserAndBuildNewRecipe(
    recipeBuilder: PortalRecipeBuilder
  ): Promise<Result<SerializableRecipe, string>> {
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
            this.prompts.displayStepAddedSuccessfullyMessage();
            addAnotherStep = await this.prompts.addAnotherStepSelectionPrompt();
          } else {
            return Result.failure(contentResult.error!);
          }
          break;
        }
        case StepType.Endpoint: {
          const endpointGroupName = await this.prompts.endpointGroupNamePrompt();
          const endpointName = await this.prompts.endpointNamePrompt();
          const description = await this.prompts.endpointDescriptionPrompt();
          const endpointPermalink = await this.createPermalink([endpointGroupName, endpointName]);
          recipeBuilder.addEndpointStep(stepName, stepName, description, endpointPermalink);
          this.prompts.displayStepAddedSuccessfullyMessage();
          addAnotherStep = await this.prompts.addAnotherStepSelectionPrompt();
          break;
        }
      }
      idx++;
    }

    return Result.success(recipeBuilder.build());
  }

  //TODO: Figure out a way to dynamically update tailIncludes property in build config file.
  private async registerRecipeInBuildConfig(
    recipeName: string,
    recipeFileName: string,
    buildDirectoryPath: string
  ): Promise<void> {
    const scriptReference = this.getRecipeScriptReferenceForTailIncludesProperty(recipeName, recipeFileName);
    await this.writeTailIncludesToBuildConfig(scriptReference, buildDirectoryPath);
  }

  private async writeTailIncludesToBuildConfig(tailIncludes: string, buildDirectoryPath: string): Promise<void> {
    const files = await fs.promises.readdir(buildDirectoryPath);
    const buildFile = files.find((file) => file === this.BUILD_FILE_NAME);

    const buildFilePath = path.join(buildDirectoryPath, buildFile!);
    const fileData = await fs.promises.readFile(buildFilePath, "utf-8");
    const buildConfig = JSON.parse(fileData);

    buildConfig.generatePortal.tailIncludes = tailIncludes;

    await fs.promises.writeFile(buildFilePath, JSON.stringify(buildConfig, null, 2));
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

  private async addRecipeToToc(
    tocData: any,
    tocFilePath: string,
    recipeName: string,
    recipeFileName: string
  ): Promise<void> {
    let apiRecipesGroup = tocData.toc?.find((item: any) => item.group === "API Recipes");
    if (!apiRecipesGroup) {
      apiRecipesGroup = {
        group: "API Recipes",
        items: []
      };
      tocData.toc.push(apiRecipesGroup);
    }

    apiRecipesGroup.items.push({
      page: recipeName,
      file: `api-recipes/${recipeFileName}.md`
    });

    await fs.promises.writeFile(tocFilePath, stringify(tocData));
  }

  private async createPermalink(pathPieces: string[]): Promise<string> {
    return `$e/${pathPieces.map(encodeURIComponent).join("/")}`;
  }

  private async createMarkdownFile(recipeFileName: string, contentFolder: string): Promise<void> {
    const directory = path.join(contentFolder, "content", "api-recipes");
    const markdownFileContent = this.getMarkdownFileContent();

    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${directory}/${recipeFileName}.md`, markdownFileContent);
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

  //TODO: Create a type for the build config and use that here instead of any.
  private async parseBuildConfig(buildDirectoryPath: string): Promise<Result<any, string>> {
    const files = await fs.promises.readdir(buildDirectoryPath);
    const buildFile = files.find((file) => file === this.BUILD_FILE_NAME);

    if (!buildFile) {
      return Result.failure("No APIMATIC-BUILD.json file found in the current directory.");
    }

    const fileData = await fs.promises.readFile(path.join(buildDirectoryPath, buildFile), "utf-8");
    return Result.success(JSON.parse(fileData));
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

  private getMarkdownFileContent(): string {
    return `# This is a Guided Walkthrough File
This is the starter content`;
  }

  private getRecipeScriptReferenceForTailIncludesProperty(recipeName: string, recipeFileName: string): string {
    return `${this.getScriptTagForWorkflow(
      recipeFileName
    )}<script>document.addEventListener('DOMContentLoaded', (event) => {APIMaticDevPortal.ready(({ registerWorkflow }) => {${this.getNewRegisteredWorkflow(
      recipeName,
      recipeFileName
    )}});});</script>`;
  }

  private getScriptTagForWorkflow(recipeFileName: string): string {
    return `<script defer src='./static/scripts/api-recipes/${recipeFileName}.js'></script>`;
  }

  private getNewRegisteredWorkflow(recipeName: string, recipeFileName: string): string {
    return `registerWorkflow('page:api-recipes/${recipeFileName}','${recipeName}',SampleWorkflow);`;
  }
}
