import * as path from "path";
import fs from "fs";
import fsExtra from "fs-extra";
import which from "which";
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
import { SdlEndpoint } from "../../../types/sdl/sdl.js";

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

    const recipeResult = await this.promptUserAndBuildNewRecipe(
      buildConfigResult.value,
      contentFolderPath,
      recipeName,
      configDir
    );
    if (recipeResult.isFailed()) {
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

    const buildDirectoryStructure = await this.getBuildDirectoryStructure(recipeFileName);

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
    buildConfig: any,
    contentFolderPath: string,
    recipeName: string,
    configDir: string
  ): Promise<Result<SerializableRecipe, string>> {
    const recipe = new PortalRecipe(recipeName);
    let endpointGroups: Map<string, SdlEndpoint[]> | undefined;
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
          if (!endpointGroups) {
            const extractEndpointGroupsFromSdlResult = await this.extractEndpointGroupsFromSdl(
              buildConfig,
              contentFolderPath,
              configDir
            );
            if (extractEndpointGroupsFromSdlResult.isFailed()) {
              return Result.failure(`${extractEndpointGroupsFromSdlResult.error!}`);
            }
            endpointGroups = extractEndpointGroupsFromSdlResult.value!;
          }
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
      const tempFilePath = path.join(tmpdir(), `recipe-markdown-content-${Date.now()}.md`);
      const template = `# The Heading Goes Here\n\nThis is placeholder text for your API Recipe content step. Feel free to edit this. Save your changes and then close the file once you're done.`;

      await fsExtra.writeFile(tempFilePath, template);

      if (!editor) {
        if (process.platform === "win32") {
          await execa("cmd", ["/c", "start", "/wait", "notepad", tempFilePath], { stdio: "ignore" });
        } else if (process.platform === "darwin") {
          editor = "open -e";
          await execa(editor, [tempFilePath], { stdio: "ignore" });
        }
        else if (process.platform === "linux") {
          const [ editor, ...args ] = await this.findEditorLinux();
          
          await execa(editor, [...args, tempFilePath], { stdio: "ignore" });
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

  private async findEditorLinux() {
    const editors = [
      ['gedit'],
      ['kate'],
      ['pluma'],
      ['mousepad'],
      ['leafpad'],
      ['xed'],
      ['code', '--wait'],
      ['atom', '--wait'],
      ['sublime-text', '--wait'],
    ];

    for (const editor of editors) {
      try {
        await which(editor[0]);
        return editor;
      } catch {
        // Ignore and move on to the next editor
      }
    }

    throw new Error('No supported GUI editor found on this Linux system.'); 
  }

  private async promptUserAndAddEndpointStepToRecipe(
    recipe: PortalRecipe,
    endpointGroups: Map<string, SdlEndpoint[]>,
    stepName: string
  ): Promise<void> {
    const endpointGroupName = await this.prompts.endpointGroupNamePrompt(endpointGroups);
    const endpointName = await this.prompts.endpointNamePrompt(endpointGroups, endpointGroupName);
    const description = await this.prompts.endpointDescriptionPrompt(endpointGroups, endpointGroupName, endpointName);
    const endpointPermalink = await this.createPermalink([endpointGroupName, endpointName]);
    recipe.addEndpointStep(stepName, stepName, description, endpointPermalink);
    this.prompts.displayStepAddedSuccessfullyMessage();
  }

  //TODO: Replace any with concrete toc file object.
  private async parseTocFile(tocFilePath: string): Promise<Result<any, string>> {
    // Check if the file exists
    if (!fs.existsSync(tocFilePath)) {
      return Result.failure<any, string>(
        `TOC file not found at ${tocFilePath}. Please run 'apimatic:toc:new' to create your TOC file first.`
      );
    }

    try {
      const tocContent = await fs.promises.readFile(tocFilePath, "utf-8");
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
      (item: any) => item.page === recipeName || item.file === `recipes/${recipeFileName}.md`
    );
    if (existingRecipe) {
      return true;
    }

    return false;
  }

  private async getBuildDirectoryStructure(
    recipeFileName: string
  ): Promise<DirectoryNode> {
    return {
      content: {
        "toc.yml : # Contains the API Recipes group with a new page for your API recipe": null
      },
      static: {
        scripts: {
          recipes: {
            [`${recipeFileName}.js : # Generated recipe script file containing all of the steps`]: null
          }
        }
      }
    };
  }

  private async extractEndpointGroupsFromSdl(
    buildConfig: any,
    contentFolderPath: string,
    configDir: string
  ): Promise<Result<Map<string, SdlEndpoint[]>, string>> {
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
      return Result.failure(`${endpointGroupsResult.error!}`);
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
