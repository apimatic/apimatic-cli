import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { DirectoryNode, StepType } from "../../../types/recipe/recipe.js";
import { Result } from "neverthrow";
import { SdlParser } from "../../../application/portal/toc/sdl-parser.js";
import { PortalService } from "../../../infrastructure/services/portal-service.js";
import { SdlEndpoint } from "../../../types/sdl/sdl.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { ActionResult } from "../../action-result.js";
import { TocContext } from "../../../types/toc-context.js";
import { FileName } from "../../../types/file/fileName.js";
import { Toc } from "../../../types/toc/toc.js";
import { PortalRecipe } from "../../../application/portal/recipe/portal-recipe.js";
import { PortalRecipeGenerator } from "../../../application/portal/recipe/recipe-generator.js";
import { TreeObject } from "treeify";
import { BuildContext } from "../../../types/build-context.js";
import { ContentContext } from "../toc/new-toc.js";
import { SpecContext } from "../../../types/spec-context.js";
import { LauncherService } from "../../../infrastructure/launcher-service.js";
import { FileService } from "../../../infrastructure/file-service.js";
import { FilePath } from "../../../types/file/filePath.js";
import { toPascalCase } from "../../../utils/utils.js";
import { withDirPath } from "../../../infrastructure/tmp-extensions.js";

class RecipeContext {
  constructor(private recipeName: string) {}

  getRecipeName(): FileName {
    return new FileName(toPascalCase(this.recipeName.trim()));
  }

  exists(tocData: Toc, recipeName: string, recipeFileName: FileName): boolean {
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

class EndpointContext {
  private readonly sdlParser: SdlParser;
  private readonly fileService = new FileService();

  constructor(
    private specDirPath: DirectoryPath,
    private configDirectory: DirectoryPath,
    private commandMetadata: CommandMetadata
  ) {
    const portalService = new PortalService();
    this.sdlParser = new SdlParser(portalService, this.configDirectory, this.commandMetadata);
  }

  async exists(): Promise<boolean> {
    return this.fileService.directoryExists(this.specDirPath);
  }

  async extractEndpointGroups(): Promise<Result<Map<string, SdlEndpoint[]>, string>> {
    return await this.sdlParser.getEndpointGroupsFromSdl(this.specDirPath);
  }
}

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts = new PortalRecipePrompts();
  private readonly launcherService = new LauncherService();
  private readonly fileService = new FileService();

  constructor(private readonly configDirectory: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public async execute(buildDirectory: DirectoryPath, name?: string): Promise<ActionResult> {
    this.prompts.displayWelcomeMessage();

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      this.prompts.invalidBuildDirectory(buildDirectory);
      return ActionResult.failed();
    }
    const buildConfig = await buildContext.getBuildFileContents();

    const recipeName = name ?? (await this.prompts.recipeNamePrompt());
    if (!recipeName) {
      this.prompts.recipeNameEmpty();
      return ActionResult.cancelled();
    }

    const contentDirectory = buildDirectory.join("content");
    const contentContext = new ContentContext(contentDirectory);

    if (!(await contentContext.exists())) {
      this.prompts.contentFolderNotFound();
      return ActionResult.failed();
    }

    const specDirectory = buildDirectory.join("spec");
    const specContext = new SpecContext(specDirectory);

    if (!(await specContext.validate())) {
      this.prompts.specFileEmptyInvalid();
      return ActionResult.failed();
    }

    // Setup TOC context
    const tocContext = new TocContext(contentDirectory);
    const tocData = await tocContext.parseTocData();

    // Setup recipe context
    const recipeContext = new RecipeContext(recipeName);
    const recipeFileName = recipeContext.getRecipeName();

    // Check if the recipe already exists
    const recipeAlreadyExists = recipeContext.exists(tocData, recipeName, recipeFileName);
    if (recipeAlreadyExists && !(await this.prompts.overwriteApiRecipeInTocPrompt(recipeName))) {
      return ActionResult.cancelled();
    }

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
          const contentResult = await this.promptForContent();
          recipe.addContentStep(stepName, contentResult);
          this.prompts.displayStepAddedSuccessfullyMessage();
          break;
        }

        case StepType.Endpoint: {
          if (!endpointGroups) {
            const endpointContext = new EndpointContext(specDirectory, this.configDirectory, this.commandMetadata);
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

          recipe.addEndpointStep(stepName, description, endpointPermalink);
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
      contentDirectory
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

  private async promptForContent(): Promise<string> {
    return await withDirPath(async (tempDir) => {
      const tempFile = new FilePath(tempDir, new FileName(`recipe-markdown-content-${Date.now()}.md`));
      const defaultContent =
        "# The Heading Goes Here\n\n" +
        "This is placeholder text for your API Recipe content step. " +
        "Feel free to edit this. Save your changes and then close the file once you're done.";

      await this.fileService.writeContents(tempFile, defaultContent);
      await this.launcherService.openInEditor(tempFile);

      const fileContent = await this.fileService.getContents(tempFile);
      return fileContent.replace(/\r\n|\r/g, "\n");
    });
  }
}
