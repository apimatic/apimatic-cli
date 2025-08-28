import fsExtra from "fs-extra";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { DirectoryNode, SerializableRecipe } from "../../../types/recipe/recipe.js";
import { err, ok, Result } from "neverthrow";
import { SdlParser } from "../../../application/portal/toc/sdl-parser.js";
import { PortalService } from "../../../infrastructure/services/portal-service.js";
import { SdlEndpoint } from "../../../types/sdl/sdl.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { BuildConfig } from "../../../types/build/build.js";
import { ActionResult } from "../../action-result.js";
import { TocContext } from "../../../types/toc-context.js";
import { FileName } from "../../../types/file/fileName.js";
import fs from "fs";
import path from "path";
import { Toc } from "../../../types/toc/toc.js";
import { tmpdir } from "os";
import { execa } from "execa";
import { PortalRecipe } from "../../../application/portal/recipe/portal-recipe.js";
import { StepType } from "../../../types/recipe/recipe.js";
import { PortalRecipeGenerator } from "../../../application/portal/recipe/recipe-generator.js";
import { TreeObject } from "treeify";

class BuildConfigContext {
  private readonly BUILD_FILE_NAME: string = "APIMATIC-BUILD.json";
  private readonly prompts: PortalRecipePrompts = new PortalRecipePrompts();

  constructor(private buildDirectory: DirectoryPath) {}

  async findBuildConfigPath(): Promise<Result<string, string>> {
    const files = await fs.promises.readdir(this.buildDirectory.toString());
    const buildFileExists = files.find((file) => file === this.BUILD_FILE_NAME);
    if (!buildFileExists) {
      const promptResult = await this.prompts.buildConfigFilePathPrompt(this.buildDirectory.toString());
      return ok(promptResult);
    }

    return ok(path.join(this.buildDirectory.toString(), this.BUILD_FILE_NAME));
  }

  async parseBuildConfig(): Promise<Result<BuildConfig, string>> {
    try {
      const buildConfigPathResult = await this.findBuildConfigPath();
      if (buildConfigPathResult.isErr()) {
        return err(buildConfigPathResult.error);
      }
      const fileData = await fs.promises.readFile(buildConfigPathResult.value, "utf-8");
      return ok(JSON.parse(fileData));
    } catch {
      return err(
        `There was an error parsing the build config file. Please check your build config file and try again later.`
      );
    }
  }

  async getContentFolderPath(buildConfig: BuildConfig): Promise<DirectoryPath> {
    const contentFolder = buildConfig.generatePortal?.contentFolder;
    if (contentFolder) {
      return new DirectoryPath(path.join(this.buildDirectory.toString(), contentFolder));
    }

    return new DirectoryPath(this.buildDirectory.toString());
  }

  async getSpecFolderPath(buildConfig: BuildConfig): Promise<DirectoryPath> {
    const apiSpecPath = buildConfig.generatePortal?.apiSpecPath;
    if (apiSpecPath) {
      return new DirectoryPath(
        path.join((await this.getContentFolderPath(buildConfig)).toString(), apiSpecPath.toString())
      );
    }

    return new DirectoryPath(path.join((await this.getContentFolderPath(buildConfig)).toString(), "spec"));
  }
}

class RecipeContext {
  constructor(private recipeName: string, private contentFolderPath: DirectoryPath) {}

  createRecipeFileName(): FileName {
    return new FileName(this.toPascalCase(this.recipeName.trim()));
  }

  private toPascalCase(str: string): string {
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  }

  async save(): Promise<Result<string, string>> {
    throw new Error("Method not implemented");
  }
}

class EndpointContext {
  private readonly sdlParser: SdlParser;

  constructor(
    private specPath: DirectoryPath,
    private configDirectory: DirectoryPath,
    private commandMetadata: CommandMetadata
  ) {
    const portalService = new PortalService();
    this.sdlParser = new SdlParser(portalService, this.configDirectory, this.commandMetadata);
  }

  async exists(): Promise<boolean> {
    return fsExtra.pathExists(this.specPath.toString());
  }

  async extractEndpointGroups(): Promise<Result<Map<string, SdlEndpoint[]>, string>> {
    const result = await this.sdlParser.getEndpointGroupsFromSdl(this.specPath);

    if (!result.value) {
      return err("No endpoint groups found");
    }

    return ok(result.value);
  }
}

class ContentStepContext {
  async promptForContent(): Promise<Result<string, string>> {
    const tempFilePath = path.join(tmpdir(), `recipe-markdown-content-${Date.now()}.txt`);
    const template =
      `# The Heading Goes Here\n\n` +
      `This is placeholder text for your API Recipe content step. ` +
      `Feel free to edit this. Save your changes and then close the file once you're done.`;

    await fsExtra.writeFile(tempFilePath, template, "utf-8");

    try {
      const editorResult = await this.openEditor(tempFilePath);
      if (editorResult.isErr()) {
        return err(editorResult.error);
      }

      const fileContent = await fsExtra.readFile(tempFilePath, "utf-8");
      return ok(fileContent);
    } catch {
      return err("Unable to add content step. Please try again later.");
    } finally {
      await fsExtra.unlink(tempFilePath);
    }
  }

  private async openEditor(tempFilePath: string): Promise<Result<null, string>> {
    let editor = process.env.EDITOR;
    let editorArgs: string[] = [];

    try {
      if (!editor) {
        if (process.platform === "win32") {
          await execa("cmd", ["/c", "start", "/wait", "notepad", tempFilePath], { stdio: "ignore" });
        } else if (process.platform === "darwin" || process.platform === "linux") {
          editor = "vim";
          try {
            await execa(editor, [tempFilePath], { stdio: "inherit" });
          } catch {
            // ignore vim exit non-zero codes
          }
        }
      } else {
        if (editor === "code" || editor.endsWith("code.cmd") || editor.endsWith("code.exe")) {
          editorArgs.push("--wait");
        }
        editorArgs.push(tempFilePath);
        await execa(editor, editorArgs, { stdio: "ignore" });
      }

      return ok(null);
    } catch {
      return err("Failed to open editor for content step.");
    }
  }
}

type RecipeSetup = {
  recipeName: string;
  recipeFileName: FileName;
  buildConfig: BuildConfig;
  contentFolderPath: DirectoryPath;
  tocData: Toc;
  buildConfigContext: BuildConfigContext;
  endpointContext: EndpointContext;
  recipeContext: RecipeContext;
  tocContext: TocContext;
};

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts = new PortalRecipePrompts();

  constructor(private readonly configDirectory: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public async execute(buildDirectory: DirectoryPath, name?: string): Promise<ActionResult> {
    const validationResult = await this.validateBuildDirectory(buildDirectory);
    if (validationResult.isErr()) {
      this.prompts.logError(validationResult.error);
      return ActionResult.failed();
    }
    const setupResult = await this.setupRecipe(buildDirectory, name);
    if (setupResult.isErr()) {
      this.prompts.logError(setupResult.error);
      return ActionResult.failed();
    }
    const recipeAlreadyExists = this.checkRecipeAlreadyExists(
      setupResult.value.tocData,
      setupResult.value.recipeName,
      setupResult.value.recipeFileName
    );
    if (recipeAlreadyExists && !(await this.prompts.overwriteApiRecipeInTocPrompt())) {
      return ActionResult.cancelled();
    }

    const recipeResult = await this.promptUserAndBuildNewRecipe(
      setupResult.value.recipeName,
      setupResult.value.buildConfig,
      setupResult.value.contentFolderPath,
      setupResult.value.endpointContext
    );

    if (recipeResult.isErr()) {
      this.prompts.logError(recipeResult.error);
      return ActionResult.failed();
    }

    const buildConfigPathResult = await setupResult.value.buildConfigContext.findBuildConfigPath();
    if (buildConfigPathResult.isErr()) {
      this.prompts.logError(buildConfigPathResult.error);
      return ActionResult.failed();
    }

    const recipeGenerator = new PortalRecipeGenerator();
    await recipeGenerator.createRecipe(
      recipeResult.value,
      setupResult.value.buildConfig,
      setupResult.value.tocData,
      setupResult.value.tocContext.tocPath.toString(),
      setupResult.value.recipeName,
      setupResult.value.recipeFileName.toString(),
      buildConfigPathResult.value,
      setupResult.value.contentFolderPath.toString()
    );
    const buildDirectoryStructure = await this.getBuildDirectoryStructure(setupResult.value.recipeFileName.toString());
    this.prompts.displayBuildDirectoryStructureAsTree(buildDirectoryStructure as TreeObject);
    return ActionResult.success();
  }

  private async getBuildDirectoryStructure(recipeFileName: string): Promise<DirectoryNode> {
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

  private async promptUserAndBuildNewRecipe(
    recipeName: string,
    buildConfig: BuildConfig,
    contentFolderPath: DirectoryPath,
    endpointContext: EndpointContext
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
          const contentStepContext = new ContentStepContext();
          const contentResult = await contentStepContext.promptForContent();
          if (contentResult.isErr()) {
            return err(contentResult.error);
          }
          recipe.addContentStep(stepName, stepName, contentResult.value);
          this.prompts.displayStepAddedSuccessfullyMessage();
          break;
        }

        case StepType.Endpoint: {
          if (!endpointGroups) {
            const extractResult = await endpointContext.extractEndpointGroups();
            if (extractResult.isErr()) {
              return err(extractResult.error);
            }
            endpointGroups = extractResult.value;
          }

          const endpointGroupName = await this.prompts.endpointGroupNamePrompt(endpointGroups);
          const endpointName = await this.prompts.endpointNamePrompt(endpointGroups, endpointGroupName);
          const description = await this.prompts.endpointDescriptionPrompt(
            endpointGroups,
            endpointGroupName,
            endpointName
          );
          const endpointPermalink = `$e/${[endpointGroupName, endpointName].map(encodeURIComponent).join("/")}`;

          recipe.addEndpointStep(stepName, stepName, description, endpointPermalink);
          this.prompts.displayStepAddedSuccessfullyMessage();
          break;
        }
      }

      addAnotherStep = await this.prompts.addAnotherStepSelectionPrompt();
      idx++;
    }

    return ok(recipe.toSerializableRecipe());
  }

  private async validateBuildDirectory(buildDirectoryPath: DirectoryPath): Promise<Result<string, string>> {
    if (!(await fsExtra.pathExists(buildDirectoryPath.toString()))) {
      return err(`Portal build input folder ${buildDirectoryPath.toString()} does not exist.`);
    }

    return ok("Portal build input folder path validated successfully.");
  }

  private async setupRecipe(buildDirectory: DirectoryPath, name?: string): Promise<Result<RecipeSetup, string>> {
    const recipeName = name ?? (await this.prompts.recipeNamePrompt());
    const buildConfigContext = new BuildConfigContext(buildDirectory);

    const buildConfigPathResult = await buildConfigContext.findBuildConfigPath();
    if (buildConfigPathResult.isErr()) {
      return err(buildConfigPathResult.error);
    }

    const buildConfigResult = await buildConfigContext.parseBuildConfig();
    if (buildConfigResult.isErr()) {
      return err(`Unable to generate API Recipe: ${buildConfigResult.error}`);
    }

    const contentFolderPath = await buildConfigContext.getContentFolderPath(buildConfigResult.value);

    const tocContext = new TocContext(contentFolderPath.join("content"));

    const tocDataResult = await tocContext.parseTocData();
    if (tocDataResult.isErr()) {
      return err(`Unable to generate API Recipe: ${tocDataResult.error}`);
    }

    const specFolderPath = await buildConfigContext.getSpecFolderPath(buildConfigResult.value);
    const endpointContext = new EndpointContext(specFolderPath, this.configDirectory, this.commandMetadata);

    const recipeContext = new RecipeContext(recipeName, contentFolderPath);
    const recipeFileName = recipeContext.createRecipeFileName();

    const recipeSetup: RecipeSetup = {
      recipeName,
      recipeFileName,
      buildConfig: buildConfigResult.value,
      contentFolderPath,
      tocData: tocDataResult.value,
      buildConfigContext,
      endpointContext,
      recipeContext,
      tocContext
    };

    return ok(recipeSetup);
  }

  private checkRecipeAlreadyExists(tocData: Toc, recipeName: string, recipeFileName: FileName): boolean {
    let apiRecipesGroup = tocData.toc?.find((item) => "group" in item && item.group === "API Recipes");
    if (!apiRecipesGroup || !("items" in apiRecipesGroup)) {
      return false;
    }

    // Check if recipe name or file name already exists
    const existingRecipe = apiRecipesGroup.items.find(
      (item) =>
        "page" in item && "file" in item && (item.page === recipeName || item.file === `recipes/${recipeFileName}.md`)
    );
    if (existingRecipe) {
      return true;
    }

    return false;
  }
}
