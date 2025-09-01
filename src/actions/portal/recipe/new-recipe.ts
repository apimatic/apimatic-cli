import fsExtra from "fs-extra";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { DirectoryNode } from "../../../types/recipe/recipe.js";
import { err, ok, Result } from "neverthrow";
import { SdlParser } from "../../../application/portal/toc/sdl-parser.js";
import { PortalService } from "../../../infrastructure/services/portal-service.js";
import { SdlEndpoint } from "../../../types/sdl/sdl.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { ActionResult } from "../../action-result.js";
import { TocContext } from "../../../types/toc-context.js";
import { FileName } from "../../../types/file/fileName.js";
import path from "path";
import { Toc } from "../../../types/toc/toc.js";
import { tmpdir } from "os";
import { execa } from "execa";
import { PortalRecipe } from "../../../application/portal/recipe/portal-recipe.js";
import { StepType } from "../../../types/recipe/recipe.js";
import { PortalRecipeGenerator } from "../../../application/portal/recipe/recipe-generator.js";
import { TreeObject } from "treeify";
import { BuildContext } from "../../../types/build-context.js";
import { ContentContext } from "../toc/new-toc.js";
import { SpecContext } from "../../../types/spec-context.js";

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
    try {
      const recipeFileName = this.createRecipeFileName();
      const recipePath = path.join(this.contentFolderPath.toString(), "recipes", `${recipeFileName}.md`);

      // Ensure the recipes directory exists
      await fsExtra.ensureDir(path.dirname(recipePath));

      // Create a basic markdown file for the recipe
      const recipeContent = `# ${this.recipeName}\n\nThis is a generated API recipe.`;
      await fsExtra.writeFile(recipePath, recipeContent, "utf-8");

      return ok(recipePath);
    } catch (error) {
      return err(`Failed to save recipe: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
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

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts = new PortalRecipePrompts();

  constructor(private readonly configDirectory: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public async execute(buildDirectory: DirectoryPath, name?: string): Promise<ActionResult> {
    // Validate build directory
    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      this.prompts.invalidBuildDirectory(buildDirectory);
      return ActionResult.failed();
    }

    // Get the recipe name
    const recipeName = name ?? (await this.prompts.recipeNamePrompt());
    if (!recipeName) {
      this.prompts.recipeNameEmpty();
      return ActionResult.cancelled();
    }

    //build config logic exists
    const buildConfig = await buildContext.getBuildFileContents();

    const contentContext = ContentContext.fromBuildConfig(buildConfig, buildDirectory);

    if (!(await contentContext.exists())) {
      this.prompts.contentFolderNotFound();
      return ActionResult.failed();
    }

    // Setup TOC context
    const tocContext = new TocContext(contentContext.getTocDirectory());
    const tocDataResult = await tocContext.parseTocData();
    if (tocDataResult.isErr()) {
      this.prompts.apiRecipeGenerationFailed();
      return ActionResult.failed();
    }
    const tocData = tocDataResult.value;

    // Setup recipe context
    //model the recipe in a better way
    const recipeContext = new RecipeContext(recipeName, contentContext.contentDirectoryPath);
    const recipeFileName = recipeContext.createRecipeFileName();

    // Check if recipe already exists
    const recipeAlreadyExists = this.checkRecipeAlreadyExists(tocData, recipeName, recipeFileName);
    if (recipeAlreadyExists && !(await this.prompts.overwriteApiRecipeInTocPrompt())) {
      return ActionResult.cancelled();
    }

    // Setup endpoint context
    const specContext = SpecContext.fromBuildConfig(buildConfig, buildDirectory);

    if (!(await specContext.validate())) {
      this.prompts.logError("Spec folder is empty or invalid.");
      return ActionResult.failed();
    }
    const endpointContext = new EndpointContext(
      specContext.specDirectoryPath,
      this.configDirectory,
      this.commandMetadata
    );

    // Build the recipe
    const recipe = new PortalRecipe(recipeName);
    let endpointGroups: Map<string, SdlEndpoint[]> | undefined;
    let idx: number = 1;
    let addAnotherStep: boolean;

    this.prompts.displayStepsInformation();

    do {
      const stepType = await this.prompts.stepTypeSelectionPrompt();
      if (!stepType) return ActionResult.cancelled();

      const stepName = await this.prompts.stepNamePrompt("Step " + idx);
      if (!stepName) return ActionResult.cancelled();


      switch (stepType) {
        case StepType.Content: {
          const contentStepContext = new ContentStepContext();
          // TODO: Sohail -> remove context and copy code from copilot
          const contentResult = await contentStepContext.promptForContent();
          if (contentResult.isErr()) {
            this.prompts.logError(contentResult.error);
            return ActionResult.failed();
          }
          recipe.addContentStep(stepName, stepName, contentResult.value);
          this.prompts.displayStepAddedSuccessfullyMessage();
          break;
        }

        case StepType.Endpoint: {
          if (!endpointGroups) {
            const extractResult = await endpointContext.extractEndpointGroups();
            if (extractResult.isErr()) {
              this.prompts.logError(extractResult.error);
              return ActionResult.failed();
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
    } while (addAnotherStep);

    const serializableRecipe = recipe.toSerializableRecipe();

    // Generate the recipe
    const recipeGenerator = new PortalRecipeGenerator();
    await recipeGenerator.createRecipe(
      serializableRecipe,
      buildConfig,
      tocData,
      tocContext.tocPath.toString(),
      recipeName,
      recipeFileName.toString(),
      buildContext.BuildFile.toString(),
      contentContext.contentDirectoryPath.toString()
    );

    // Display build directory structure
    const buildDirectoryStructure = this.getBuildDirectoryStructure(recipeFileName.toString());
    this.prompts.displayBuildDirectoryStructureAsTree(buildDirectoryStructure as TreeObject);

    return ActionResult.success();
  }

  private getBuildDirectoryStructure(recipeFileName: string): DirectoryNode {
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
