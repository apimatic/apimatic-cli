import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { DirectoryNode, StepType } from "../../../types/recipe/recipe.js";
import { PortalService } from "../../../infrastructure/services/portal-service.js";
import { Sdl, SdlEndpoint } from "../../../types/sdl/sdl.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { CommandMetadata } from "../../../types/common/command-metadata.js";
import { ActionResult } from "../../action-result.js";
import { TocContext } from "../../../types/toc-context.js";
import { FileName } from "../../../types/file/fileName.js";
import { PortalRecipe } from "../../../application/portal/recipe/portal-recipe.js";
import { PortalRecipeGenerator } from "../../../application/portal/recipe/recipe-generator.js";
import { TreeObject } from "treeify";
import { BuildContext } from "../../../types/build-context.js";
import { ContentContext } from "../toc/new-toc.js";
import { SpecContext } from "../../../types/spec-context.js";
import { LauncherService } from "../../../infrastructure/launcher-service.js";
import { FileService } from "../../../infrastructure/file-service.js";
import { FilePath } from "../../../types/file/filePath.js";
import { withDirPath } from "../../../infrastructure/tmp-extensions.js";
import { TempContext } from "../../../types/temp-context.js";
import { RecipeContext } from "../../../types/recipe-context.js";

export class PortalRecipeAction {
  private readonly prompts: PortalRecipePrompts = new PortalRecipePrompts();
  private readonly launcherService = new LauncherService();
  private readonly fileService = new FileService();
  private readonly portalService = new PortalService();

  constructor(private readonly configDirectory: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public async execute(buildDirectory: DirectoryPath, name?: string): Promise<ActionResult> {
    this.prompts.displayWelcomeMessage();

    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      this.prompts.invalidBuildDirectory(buildDirectory);
      return ActionResult.failed();
    }

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

    let stepIndex: number = 0;

    this.prompts.displayStepsInformation();

    let endpointGroups: Map<string, SdlEndpoint[]> | undefined;

    do {
      const stepType = await this.prompts.stepTypeSelectionPrompt();
      if (!stepType) return ActionResult.cancelled();

      const stepName = await this.prompts.stepNamePrompt(`Step ${++stepIndex}`);
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
            const sdlResult = await withDirPath(async (tempDirectory) => {
              const tempContext = new TempContext(tempDirectory);
              const specZipPath = await tempContext.zip(specDirectory);

              const specFileStream = await this.fileService.getStream(specZipPath);

              try {
                const sdlResult = await this.portalService.generateSdl(
                  specFileStream,
                  this.configDirectory,
                  this.commandMetadata
                );

                return sdlResult;
              } finally {
                specFileStream.close();
              }
            });

            if (sdlResult.isErr()) {
              this.prompts.serviceError(sdlResult.error);
              return ActionResult.failed();
            }
            endpointGroups = PortalRecipeAction.getEndpointGroupsFromSdl(sdlResult.value);
          }

          const endpointGroupName = await this.prompts.endpointGroupNamePrompt(endpointGroups);
          if (!endpointGroupName) return ActionResult.cancelled();
          const endpointName = await this.prompts.endpointNamePrompt(endpointGroups, endpointGroupName);
          if (!endpointName) return ActionResult.cancelled();

          const defaultDescription = PortalRecipeAction.getEndpointDescription(
            endpointGroups,
            endpointGroupName,
            endpointName
          );
          const description = await this.prompts.endpointDescriptionPrompt(defaultDescription);
          if (!description) return ActionResult.cancelled();

          recipe.addEndpointStep(stepName, description, endpointGroupName, endpointName);
          this.prompts.displayStepAddedSuccessfullyMessage();
          break;
        }
      }
    } while (await this.prompts.addAnotherStepSelectionPrompt());

    const serializableRecipe = recipe.toSerializableRecipe();
    const buildConfig = await buildContext.getBuildFileContents();

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

  // TODO: Refactor this after quick start merge
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

  private static getEndpointGroupsFromSdl(sdl: Sdl): Map<string, SdlEndpoint[]> {
    const endpointGroups = new Map<string, SdlEndpoint[]>();
    for (const endpoint of sdl.Endpoints) {
      if (!endpointGroups.has(endpoint.Group)) {
        endpointGroups.set(endpoint.Group, []);
      }

      endpointGroups.get(endpoint.Group)!.push({
        Name: endpoint.Name,
        Description: endpoint.Description,
        Group: endpoint.Group
      });
    }
    return endpointGroups;
  }

  private static getEndpointDescription(
    endpointGroups: Map<string, SdlEndpoint[]>,
    endpointGroupName: string,
    endpointName: string
  ): string {
    return endpointGroups.get(endpointGroupName)!.find((e) => e.Name === endpointName)!.Description;
  }

  private async promptForContent(): Promise<string> {
    return await withDirPath(async (tempDir) => {
      const tempFile = new FilePath(tempDir, new FileName(`recipe-markdown-content.md`));
      const defaultContent =
        "# The Heading Goes Here\n\n" +
        "This is placeholder text for your API Recipe content step. " +
        "Feel free to edit this. Save your changes and then close the file once you're done.";

      await this.fileService.writeContents(tempFile, defaultContent);
      await this.launcherService.openInEditor(tempFile);
      this.prompts.openRecipeMarkdownEditor();
      const fileContent = await this.fileService.getContents(tempFile);
      return fileContent.replace(/\r\n|\r/g, "\n");
    });
  }
}
