import prettier from "prettier";
import { stringify } from "yaml";
import { SerializableRecipe, ContentStepConfig, EndpointStepConfig } from "../../../types/recipe/recipe.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";
import { FileService } from "../../../infrastructure/file-service.js";
import { BuildConfig } from "../../../types/build/build.js";
import { Toc } from "../../../types/toc/toc.js";
import { FilePath } from "../../../types/file/filePath.js";
import { FileName } from "../../../types/file/fileName.js";

export class PortalRecipeGenerator {
  //TODO: Replace tocFileContent any type with concrete type.
  private readonly fileService: FileService = new FileService();

  public async createRecipe(
    recipe: SerializableRecipe,
    buildConfig: BuildConfig,
    tocFileContent: Toc,
    tocFilePath: FilePath,
    recipeName: string,
    recipeFileName: FileName,
    buildConfigFilePath: FilePath,
    contentFolderPath: DirectoryPath
  ) {
    await this.addRecipeToToc(tocFileContent, tocFilePath, recipeName, recipeFileName);
    await this.registerRecipeInBuildConfigFile(buildConfig, recipeName, recipeFileName, buildConfigFilePath);
    await this.createMarkdownFile(recipeFileName, contentFolderPath);

    const generatedRecipeScript = await this.createScriptFromRecipe(recipe);
    const generatedRecipeScriptsDirectoryPath = contentFolderPath.join("static", "scripts", "recipes");
    await this.saveGeneratedRecipeScriptToBuildDirectory(
      generatedRecipeScript,
      generatedRecipeScriptsDirectoryPath,
      recipeFileName
    );
  }

  private async addRecipeToToc(
    tocData: Toc,
    tocFilePath: FilePath,
    recipeName: string,
    recipeFileName: FileName
  ): Promise<void> {
    let toc = tocData.toc as any;
    let apiRecipesGroup = toc.find((item: any) => item.group === "API Recipes");

    if (!apiRecipesGroup) {
      // If the group doesn't exist, create and insert it after the last group
      apiRecipesGroup = {
        group: "API Recipes",
        items: []
      };
      // Insert after the last group section, before any generate sections
      let lastGroupIdx = -1;
      for (let i = 0; i < toc.length; i++) {
        if (toc[i].group) lastGroupIdx = i;
      }
      toc.splice(lastGroupIdx + 1, 0, apiRecipesGroup);
    }

    // Only add the recipe if it doesn't already exist
    const existingRecipe = apiRecipesGroup.items.find(
      (item: any) => item.page === recipeName || item.file === `recipes/${recipeFileName}.md`
    );
    if (!existingRecipe) {
      apiRecipesGroup.items.push({
        page: recipeName,
        file: `recipes/${recipeFileName}.md`
      });
      await this.fileService.writeContents(tocFilePath, stringify(tocData));
    }
  }

  private async registerRecipeInBuildConfigFile(
    buildConfig: BuildConfig,
    recipeName: string,
    recipeFileName: FileName,
    buildConfigFilePath: FilePath
  ): Promise<void> {
    if (!buildConfig.recipes) {
      buildConfig.recipes = {};
    }
    const recipesConfig = buildConfig.recipes as any;

    if (!recipesConfig.workflows) {
      recipesConfig.workflows = [];
    }
    const existingIndex = recipesConfig.workflows.findIndex(
      (workflow: any) => workflow.permalink === `page:recipes/${recipeFileName}`
    );

    const newWorkflow = {
      name: recipeName,
      permalink: `page:recipes/${recipeFileName}`,
      functionName: this.toPascalCase(recipeName),
      scriptPath: `./static/scripts/recipes/${recipeFileName}.js`
    };

    if (existingIndex !== -1) {
      // Replace the existing workflow
      recipesConfig.workflows[existingIndex] = newWorkflow;
    } else {
      // Add as new workflow
      recipesConfig.workflows.push(newWorkflow);
    }

    await this.writeRecipesConfigToBuildConfigFile(recipesConfig, buildConfigFilePath);
  }

  private async writeRecipesConfigToBuildConfigFile(recipesConfig: string, buildConfigFilePath: FilePath): Promise<void> {
    const fileData = await this.fileService.getContents(buildConfigFilePath);
    const buildConfig = JSON.parse(fileData);

    buildConfig.recipes = recipesConfig;

    await this.fileService.writeContents(buildConfigFilePath, JSON.stringify(buildConfig, null, 2));
  }

  private async createMarkdownFile(recipeFileName: FileName, contentFolder: DirectoryPath): Promise<void> {
    const directory = contentFolder.join("recipes");
    const markdownFileContent = this.getMarkdownFileContent();

    await this.fileService.directoryExists(directory);
    this.fileService.writeContents(new FilePath(directory, new FileName(`${recipeFileName}.md`)), markdownFileContent);

  }

  private async createScriptFromRecipe(recipe: SerializableRecipe): Promise<string> {
    let script: string = `export default function ${this.toPascalCase(recipe.name)}(workflowCtx, portal) {`;
    script += "return {";

    recipe.steps.forEach((step, index) => {
      script += `"${step.key}": {`;
      script += `name: "${step.name}",`;
      script += "stepCallback: async () => {";

      if (step.type === "content") {
        script += this.addContentStepToScript(step.config as ContentStepConfig);
      } else if (step.type === "endpoint") {
        script += this.addEndpointStepToScript(step.config as EndpointStepConfig);
      }

      script += "},";
      script += "}";

      if (index < recipe.steps.length - 1) {
        script += ",";
      }
    });

    script += "};";
    script += "}";

    return script;
  }

  private async saveGeneratedRecipeScriptToBuildDirectory(
    generatedRecipeScript: string,
    generatedRecipeScriptsDirectoryPath: DirectoryPath,
    recipeFileName: FileName,
    format: boolean = false
  ): Promise<void> {
    if (format) {
      generatedRecipeScript = await this.formatScript(generatedRecipeScript);
    }

    this.fileService.createDirectoryIfNotExists(generatedRecipeScriptsDirectoryPath);
    await this.fileService.writeContents(new FilePath(generatedRecipeScriptsDirectoryPath, new FileName(`${recipeFileName}.js`)), generatedRecipeScript);
  }

  private generateVerifyFunction(): string {
    return `if (response.StatusCode == 200) { return true; } else { setError("API Call wasn't able to get a valid response. Please try again."); return false; }`;
  }

  private addContentStepToScript(contentConfig: ContentStepConfig): string {
    return `return workflowCtx.showContent(${JSON.stringify(contentConfig.content)});`;
  }

  private addEndpointStepToScript(endpointConfig: EndpointStepConfig): string {
    let script = "return workflowCtx.showEndpoint({";
    if (endpointConfig.description !== "") {
      script += `description: ${JSON.stringify(endpointConfig.description)},`;
    }
    script += `endpointPermalink: "${endpointConfig.endpointPermalink}",`;
    script += "verify: (response, setError) => {";
    script += this.generateVerifyFunction();
    script += "},";
    script += "});";
    return script;
  }

  private getMarkdownFileContent(): string {
    return `# This is a Guided Walkthrough File
This is the starter content`;
  }

  private async formatScript(code: string): Promise<string> {
    return prettier.format(code, {
      parser: "babel",
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "es5"
    });
  }

  private toPascalCase(str: string): string {
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  }
}
