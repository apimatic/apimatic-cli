import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { TreeObject } from "treeify";
import { PortalRecipePrompts } from "../../prompts/portal/recipe";
import { SerializableRecipe, StepType, DirectoryNode } from "../../types/portal/recipe";
import { getMessageInRedColor, isValidUrl } from "../../utils/utils";
import { Result } from "../../types/common/result";
import { PortalRecipeBuilder } from "../../application/portal/recipe-builder";
import { PortalRecipeGenerator } from "../../application/portal/recipe-generator";

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts;

  constructor() {
    this.prompts = new PortalRecipePrompts();
  }

  public async createRecipe(name: string | undefined, destinationPath: string | undefined): Promise<void> {
    const buildDirectoryPath = destinationPath ?? process.cwd();
    const recipeName = (name ?? (await this.prompts.recipeNamePrompt())).split(" ").join("");
    const recipeBuilder = new PortalRecipeBuilder(recipeName);
    const recipeGenerator = new PortalRecipeGenerator();

    //TODO: Create a type for the build config and use that here instead of any.
    const buildConfig = await this.parseBuildConfig(buildDirectoryPath);
    if (!buildConfig.isSuccess) {
      this.prompts.logError(getMessageInRedColor(`Unable to generate API Recipe: ${buildConfig.error!}`));
    }

    const contentFolder = buildConfig.value.generatePortal?.contentFolder ?? buildDirectoryPath;
    const recipeResult = await this.promptUserAndBuildNewRecipe(recipeBuilder);
    if (!recipeResult.isSuccess) {
      this.prompts.logError(getMessageInRedColor(`Unable to generate API Recipe: ${recipeResult.error!}`));
    }

    await this.createMarkdownFile(recipeName, contentFolder);

    const generatedRecipeScript = await recipeGenerator.createScriptFromRecipe(recipeResult.value!);
    const generatedRecipeScriptsDirectoryPath = path.join(contentFolder, "static", "scripts", "api-recipes");
    await recipeGenerator.saveGeneratedRecipeScriptToBuildDirectory(
      generatedRecipeScript,
      generatedRecipeScriptsDirectoryPath,
      recipeName
    );

    await this.registerRecipeInBuildConfig(buildConfig.value!, recipeName, buildDirectoryPath);
    await this.addRecipeToToc(recipeName, contentFolder);

    const buildDirectoryStructure = await this.getBuildDirectoryStructure(contentFolder, recipeName);

    this.prompts.displayBuildDirectoryStructureAsTree(buildDirectoryStructure as TreeObject);
    this.prompts.displayRecipeGenerationSuccessMessage();
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
          addAnotherStep = await this.prompts.addAnotherStepSelectionPrompt();
          break;
        }
      }
      idx++;
    }

    return Result.success(recipeBuilder.build());
  }

  private async registerRecipeInBuildConfig(
    buildConfig: any,
    recipeName: string,
    buildDirectoryPath: string
  ): Promise<void> {
    const scriptReference = this.getRecipeScriptReferenceForTailIncludesProperty(recipeName);
    const tailIncludesContent = buildConfig.generatePortal.tailIncludes;

    if (tailIncludesContent) {
      const overwriteTailIncludes = await this.prompts.overwriteTailIncludesPrompt();
      if (overwriteTailIncludes) {
        await this.writeTailIncludesToBuildConfig(scriptReference, buildDirectoryPath);
      }
    }

    await this.writeTailIncludesToBuildConfig(scriptReference, buildDirectoryPath);
  }

  private async writeTailIncludesToBuildConfig(tailIncludes: string, buildDirectoryPath: string): Promise<void> {
    const files = await fs.promises.readdir(buildDirectoryPath);
    const buildFile = files.find((file) => file.endsWith("APIMATIC-BUILD.json"));

    const buildFilePath = path.join(buildDirectoryPath, buildFile!);
    const fileData = await fs.promises.readFile(buildFilePath, "utf-8");
    const buildConfig = JSON.parse(fileData);

    buildConfig.generatePortal.tailIncludes = tailIncludes;

    await fs.promises.writeFile(buildFilePath, JSON.stringify(buildConfig, null, 2));
  }

  private async addRecipeToToc(recipeName: string, contentFolder: string): Promise<void> {
    const tocFilePath = path.join(contentFolder, "content", "toc.yml");
    const tocContent = await fs.promises.readFile(tocFilePath, "utf-8");
    const tocData = yaml.parse(tocContent);

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
      file: `api-recipes/${recipeName}.md`
    });

    await fs.promises.writeFile(tocFilePath, yaml.stringify(tocData));
  }

  private async createPermalink(pathPieces: string[]): Promise<string> {
    return `$e/${pathPieces.map(encodeURIComponent).join("/")}`;
  }

  private async createMarkdownFile(recipeName: string, contentFolder: string): Promise<void> {
    const directory = path.join(contentFolder, "content", "api-recipes");
    const markdownFileContent = this.getMarkdownFileContent();

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

  //TODO: Create a type for the build config and use that here instead of any.
  private async parseBuildConfig(buildDirectoryPath: string): Promise<Result<any, string>> {
    const files = await fs.promises.readdir(buildDirectoryPath);
    const buildFile = files.find((file) => file.endsWith("APIMATIC-BUILD.json"));

    if (!buildFile) {
      return Result.failure("No APIMATIC-BUILD.json file found in the current directory!");
    }

    const fileData = await fs.promises.readFile(path.join(buildDirectoryPath, buildFile), "utf-8");
    return Result.success(JSON.parse(fileData));
  }

  private async getBuildDirectoryStructure(
    contentFolder: string,
    recipeName: string,
    parentPath = ""
  ): Promise<DirectoryNode> {
    const markdownFilePath = `content/api-recipes/${recipeName}.md`;
    const generatedRecipeScriptFilePath = `scripts/api-recipes/${recipeName}.js`;
    const descriptions: { [key: string]: string } = Object.entries({
      "APIMATIC-BUILD.json": "# Contains the 'tailIncludes' property, which registers your recipes as workflows",
      [markdownFilePath]: "# Markdown file with static placeholder text for your API Recipe",
      "content/toc.yml": "# Contains a new group with a new page for your API Recipe",
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
        const subdirectoryStructure = await this.getBuildDirectoryStructure(itemPath, recipeName, relativePath);

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

  private getMarkdownFileContent(): string {
    return `# This is a Guided Walkthrough File
This is the starter content`;
  }

  private getRecipeScriptReferenceForTailIncludesProperty(recipeName: string): string {
    return `${this.getScriptTagForWorkflow(
      recipeName
    )}<script>document.addEventListener('DOMContentLoaded', (event) => {APIMaticDevPortal.ready(({ registerWorkflow }) => {${this.getNewRegisteredWorkflow(
      recipeName
    )}});});</script>`;
  }

  private getScriptTagForWorkflow(recipeName: string): string {
    return `<script defer src='./static/scripts/api-recipes/${recipeName}.js'></script>`;
  }

  private getNewRegisteredWorkflow(recipeName: string): string {
    return `registerWorkflow('page:api-recipes/${recipeName}','${recipeName}',SampleWorkflow);`;
  }
}
