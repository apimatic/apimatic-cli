import fsExtra from "fs-extra";
import { PortalRecipePrompts } from "../../../prompts/portal/recipe/new-recipe.js";
import { SerializableRecipe } from "../../../types/recipe/recipe.js";
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

  async  getSpecFolderPath(buildConfig: BuildConfig): Promise<DirectoryPath> {
    const apiSpecPath = buildConfig.generatePortal?.apiSpecPath;
    if (apiSpecPath) {
      return new DirectoryPath(path.join((await this.getContentFolderPath(buildConfig)).toString(), apiSpecPath.toString()));
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

  async generateRecipe(recipe: SerializableRecipe, buildConfig: BuildConfig): Promise<Result<string, string>> {
    throw new Error("Method not implemented");
  }

  async save(): Promise<Result<string, string>> {
    throw new Error("Method not implemented");
  }
}

class EndpointContext {
  constructor(private specPath: DirectoryPath, private sdlParser: SdlParser) {}

  async exists(): Promise<boolean> {
    throw new Error("Method not implemented");
  }

  async extractEndpointGroups(): Promise<Result<Map<string, SdlEndpoint[]>, string>> {
    throw new Error("Method not implemented");
  }
}

class ContentStepContext {
  async promptForContent(): Promise<Result<string, string>> {
    throw new Error("Method not implemented");
  }

  private async openEditor(): Promise<Result<string, string>> {
    throw new Error("Method not implemented");
  }
}

type RecipeSetup = {
  recipeName: string;
  recipeFileName: FileName;
  buildConfig: BuildConfig;
  contentFolderPath: DirectoryPath;
  tocData: any;
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

      //check for existing recipe   --- can be moved above (check)
      //build recipe steps
      //generate and save
    }
    return ActionResult.success();
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
    const sdlParser = new SdlParser(new PortalService(), this.configDirectory, this.commandMetadata);
    const endpointContext = new EndpointContext(specFolderPath, sdlParser);

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

  // private async buildRecipeSteps(endpointContext: EndpointContext): Promise<Result<SerializableRecipe, string>> {
  //   // Implementation for building the recipe steps
  // }

  // private async generateAndSaveRecipe(recipe: SerializableRecipe, contexts: RecipeContexts): Promise<Result<string, string>> {
  //   // Implementation for generating and saving the recipe
  // }
}
