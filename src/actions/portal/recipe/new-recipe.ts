import * as path from "path";
import fs from "fs";
import fsExtra from "fs-extra";
import { parse } from "yaml";
import { TreeObject } from "treeify";
import { tmpdir } from "os";
import { execa } from "execa";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { SerializableRecipe, StepType, DirectoryNode } from "../../../types/recipe/recipe.js";
import { Result } from "../../../types/common/result.js";
import { PortalRecipe } from "../../../application/portal/recipe/portal-recipe.js";
import { PortalRecipeGenerator } from "../../../application/portal/recipe/recipe-generator.js";
import { SdlParser } from "../../../application/portal/toc/sdl-parser.js";
import { PortalService } from "../../../infrastructure/services/portal-service.js";

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts;
  private readonly sdlParser: SdlParser;
  private readonly BUILD_FILE_NAME: string = "APIMATIC-BUILD.json";

  constructor() {
    this.prompts = new PortalRecipePrompts();
    this.sdlParser = new SdlParser(new PortalService());
  }

  public async createRecipe(
    buildDirectoryPath: string,
    configDir: string,
    buildConfigFilePath?: string,
    name?: string
  ): Promise<Result<string, string>> {
    this.prompts.displayWelcomeMessage();

    const recipeName = name ?? (await this.prompts.recipeNamePrompt());
    const recipeFileName = this.createRecipeFileName(recipeName);

    const validateBuildDirectoryPathResult = await this.validateBuildDirectoryPath(buildDirectoryPath);
    if (validateBuildDirectoryPathResult.isFailed()) {
      return Result.failure(`Unable to generate API Recipe: ${validateBuildDirectoryPathResult.error!}`);
    }

    const validateBuildConfigFilePathResult = await this.validateBuildConfigFilePath(buildConfigFilePath);
    if (validateBuildConfigFilePathResult.isFailed()) {
      return Result.failure(`Unable to generate API Recipe: ${validateBuildConfigFilePathResult}`);
    }

    //TODO: Create a type for the build config and use that here instead of any.
    const resolvedBuildConfigFilePath = await this.getResolvedBuildConfigFilePath(
      buildDirectoryPath,
      buildConfigFilePath
    );
    const buildConfigResult = await this.parseBuildConfig(resolvedBuildConfigFilePath);
    if (buildConfigResult.isFailed()) {
      return Result.failure(`Unable to generate API Recipe: ${buildConfigResult.error!}`);
    }

    const contentFolderPath = this.getContentFolderPath(buildConfigResult.value, buildDirectoryPath);
    const tocFilePath = path.join(contentFolderPath, "content", "toc.yml");
    //TODO: Replace any type of tocFileResult.value to concrete type.
    const tocFileResult = await this.parseTocFile(tocFilePath);
    if (tocFileResult.isFailed()) {
      return Result.failure(`Unable to generate API Recipe: ${tocFileResult.error!}`);
    }

    const recipeAlreadyExists = this.checkRecipeAlreadyExists(tocFileResult.value, recipeName, recipeFileName);
    if (recipeAlreadyExists && !(await this.prompts.overwriteApiRecipeInTocPrompt())) {
      return Result.cancelled("Operation was cancelled by the user.");
    }

    const extractEndpointGroupsFromSdlResult = await this.extractEndpointGroupsFromSdl(
      buildConfigResult.value,
      contentFolderPath,
      configDir
    );
    if (extractEndpointGroupsFromSdlResult.isFailed()) {
      return Result.failure(`Unable to generate API Recipe: ${extractEndpointGroupsFromSdlResult}`);
    }

    const recipeResult = await this.promptUserAndBuildNewRecipe(extractEndpointGroupsFromSdlResult.value!, recipeName);
    if (!recipeResult.isSuccess) {
      return Result.failure(`Unable to generate API Recipe: ${recipeResult.error!}`);
    }

    const recipeGenerator = new PortalRecipeGenerator();
    await recipeGenerator.createRecipe(
      recipeResult.value!,
      buildConfigResult.value!,
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
    return this.toPascalCase(recipeName.trim());
  }

  private toPascalCase(str: string): string {
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
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
  private async promptUserAndBuildNewRecipe(
    endpointGroups: Map<string, string[]>,
    recipeName: string
  ): Promise<Result<SerializableRecipe, string>> {
    const recipe = new PortalRecipe(recipeName);
    let idx: number = 1;
    let addAnotherStep = true;
    this.prompts.displayStepsInformation();
    while (addAnotherStep) {
      const stepType = await this.prompts.stepTypeSelectionPrompt();
      const stepName = await this.prompts.stepNamePrompt("Step " + idx);
      switch (stepType) {
        case StepType.Content: {
          const addContentStepResult = await this.promptUserAndAddContentStepToRecipe(recipe, stepName);
          if (addContentStepResult.isFailed()) {
            return Result.failure(addContentStepResult.error!);
          }
          break;
        }
        case StepType.Endpoint: {
          await this.promptUserAndAddEndpointStepToRecipe(recipe, endpointGroups, stepName);
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
    this.prompts.displayContentStepInfo();
    this.prompts.startProgressIndicatorWithMessage("Waiting for you to close the text editor");
    let editor = process.env.EDITOR;
    let editorArgs: string[] = [];

    try {
      const tempFilePath = path.join(tmpdir(), `api-recipe-markdown-content-${Date.now()}.md`);
      const template = `# The Heading Goes Here\n\nThis is placeholder text for your API Recipe content step. Feel free to edit this. Save your changes and then close the file once you're done.`;

      await fsExtra.writeFile(tempFilePath, template);

      if (!editor) {
        if (process.platform === "win32") {
          await execa("cmd", ["/c", "start", "/wait", "notepad", tempFilePath], { stdio: "ignore" });
        } else {
          editor = "nano";
          await execa(editor, [tempFilePath], { stdio: "ignore" });
        }
      } else {
        if (editor === "code" || editor.endsWith("code.cmd") || editor.endsWith("code.exe")) {
          editorArgs.push("--wait");
        }
        editorArgs.push(tempFilePath);
        await execa(editor, editorArgs, { stdio: "ignore" });
      }

      this.prompts.stopProgressIndicatorWithMessage("✅  Text editor closed.");
      const fileContent = await fsExtra.readFile(tempFilePath, "utf-8");

      await fsExtra.unlink(tempFilePath);

      recipe.addContentStep(stepName, stepName, fileContent);
      this.prompts.displayStepAddedSuccessfullyMessage();
      return Result.success("Added content step successfully.");
    } catch (error) {
      return Result.failure(`Unable to add content step. Please try again later.`);
    }
  }

  private async promptUserAndAddEndpointStepToRecipe(
    recipe: PortalRecipe,
    endpointGroups: Map<string, string[]>,
    stepName: string
  ): Promise<void> {
    const endpointGroupName = await this.prompts.endpointGroupNamePrompt(endpointGroups);
    const endpointName = await this.prompts.endpointNamePrompt(endpointGroups, endpointGroupName);
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
    } catch {
      return Result.failure(
        `Unable to parse the TOC file located at ${tocFilePath}. Please make sure that the TOC is a valid YAML file.`
      );
    }
  }

  private async createPermalink(pathPieces: string[]): Promise<string> {
    return `$e/${pathPieces.map(encodeURIComponent).join("/")}`;
  }

  private async getResolvedBuildConfigFilePath(
    buildDirectoryPath: string,
    buildConfigFilePath?: string
  ): Promise<string> {
    if (!buildConfigFilePath) {
      const files = await fs.promises.readdir(buildDirectoryPath);
      const buildFileExists = files.find((file) => file === this.BUILD_FILE_NAME);
      if (!buildFileExists) {
        return await this.prompts.buildConfigFilePathPrompt(buildDirectoryPath);
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
        `There was an error parsing the build config file located at "${buildConfigFilePath}". Please check your build config file and try again later.`
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

  private async getBuildDirectoryStructure(
    contentFolder: string,
    recipeFileName: string,
    parentPath = ""
  ): Promise<DirectoryNode> {
    const markdownFilePath = `content/api-recipes/${recipeFileName}.md`;
    const generatedRecipeScriptFilePath = `static/scripts/api-recipes/${recipeFileName}.js`;
    const descriptions: { [key: string]: string } = Object.entries({
      "APIMATIC-BUILD.json": "# Contains the 'recipes' property, which registers your API recipes as workflows",
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
      if (item.startsWith(".") || item === "generated_portal") return; // Skip hidden and generated_portal directories.

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

  private async extractEndpointGroupsFromSdl(
    buildConfig: any,
    contentFolderPath: string,
    configDir: string
  ): Promise<Result<Map<string, string[]>, string>> {
    const specFolderPath = this.getSpecFolderPath(buildConfig, contentFolderPath);
    if (!(await fsExtra.pathExists(specFolderPath))) {
      return Result.failure(`API specification file not found at ${specFolderPath}.`);
    }

    this.prompts.startProgressIndicatorWithMessage(
      "Extracting endpoint groups and endpoints from the API specification."
    );

    const endpointGroupsResult = await this.sdlParser.getEndpointGroupsFromSdl(
      specFolderPath,
      contentFolderPath,
      configDir
    );

    if (endpointGroupsResult.isFailed()) {
      this.prompts.stopProgressIndicatorWithMessage("Unable to extract endpoints from your API specification.");
      return Result.failure(`⚠️ ${endpointGroupsResult.error!}`);
    }

    this.prompts.stopProgressIndicatorWithMessage(
      "✅  Successfully extracted endpoint groups and endpoints from the API specification."
    );
    return Result.success(endpointGroupsResult.value!);
  }

  //TODO: Replace type of buildConfig from any to actual BuildConfig type after creating it.
  private getSpecFolderPath(buildConfig: any, contentFolderPath: string): string {
    const apiSpecPath = buildConfig.generatePortal?.apiSpecPath;
    if (apiSpecPath) {
      return path.join(contentFolderPath, apiSpecPath);
    }

    return path.join(contentFolderPath, "spec");
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
