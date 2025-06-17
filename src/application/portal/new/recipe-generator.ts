import * as fs from "fs";
import * as path from "path";
import * as prettier from "prettier";
import { stringify } from "yaml";
import { SerializableRecipe, ContentStepConfig, EndpointStepConfig } from "../../../types/portal/recipe";

export class PortalRecipeGenerator {
  //TODO: Replace tocFileContent any type with concrete type.
  public async createRecipe(
    recipe: SerializableRecipe,
    tocFileContent: any,
    tocFilePath: string,
    recipeName: string,
    recipeFileName: string,
    buildConfigFilePath: string,
    contentFolderPath: string
  ) {
    await this.addRecipeToToc(tocFileContent, tocFilePath, recipeName, recipeFileName);
    await this.registerRecipeInBuildConfigFile(recipeName, recipeFileName, buildConfigFilePath);
    await this.createMarkdownFile(recipeFileName, contentFolderPath);

    const generatedRecipeScript = await this.createScriptFromRecipe(recipe);
    const generatedRecipeScriptsDirectoryPath = path.join(contentFolderPath, "static", "scripts", "api-recipes");
    await this.saveGeneratedRecipeScriptToBuildDirectory(
      generatedRecipeScript,
      generatedRecipeScriptsDirectoryPath,
      recipeFileName
    );
  }

  private async addRecipeToToc(
    tocData: any,
    tocFilePath: string,
    recipeName: string,
    recipeFileName: string
  ): Promise<void> {
    let apiRecipesGroup = tocData.toc?.find((item: any) => item.group === "API Recipes");
    apiRecipesGroup ??= {
      group: "API Recipes",
      items: []
    };

    const existingRecipe = apiRecipesGroup.items.find(
      (item: any) => item.page === recipeName || item.file === `api-recipes/${recipeFileName}.md`
    );
    if (!existingRecipe) {
      apiRecipesGroup.items.push({
        page: recipeName,
        file: `api-recipes/${recipeFileName}.md`
      });
      tocData.toc.push(apiRecipesGroup);

      await fs.promises.writeFile(tocFilePath, stringify(tocData));
    }
  }

  //TODO: Figure out a way to dynamically update tailIncludes property in build config file.
  private async registerRecipeInBuildConfigFile(
    recipeName: string,
    recipeFileName: string,
    buildConfigFilePath: string
  ): Promise<void> {
    const scriptReference = this.getRecipeScriptReferenceForTailIncludesProperty(recipeName, recipeFileName);
    await this.writeTailIncludesToBuildConfigFile(scriptReference, buildConfigFilePath);
  }

  private async writeTailIncludesToBuildConfigFile(tailIncludes: string, buildConfigFilePath: string): Promise<void> {
    const fileData = await fs.promises.readFile(buildConfigFilePath, "utf-8");
    const buildConfig = JSON.parse(fileData);

    buildConfig.generatePortal.tailIncludes = tailIncludes;

    await fs.promises.writeFile(buildConfigFilePath, JSON.stringify(buildConfig, null, 2));
  }

  private async createMarkdownFile(recipeFileName: string, contentFolder: string): Promise<void> {
    const directory = path.join(contentFolder, "content", "api-recipes");
    const markdownFileContent = this.getMarkdownFileContent();

    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${directory}/${recipeFileName}.md`, markdownFileContent);
  }

  private async createScriptFromRecipe(recipe: SerializableRecipe): Promise<string> {
    let script: string = `async function SampleWorkflow(workflowCtx, portal) {`;
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
    generatedRecipeScriptsDirectoryPath: string,
    recipeFileName: string,
    format: boolean = true
  ): Promise<void> {
    if (format) {
      generatedRecipeScript = await this.formatScript(generatedRecipeScript);
    }

    fs.mkdirSync(generatedRecipeScriptsDirectoryPath, { recursive: true });
    await fs.promises.writeFile(
      `${generatedRecipeScriptsDirectoryPath}/${recipeFileName}.js`,
      generatedRecipeScript,
      "utf8"
    );
  }

  private generateVerifyFunction(): string {
    return `if (response.StatusCode == 200) { return true; } else { setError("API Call wasn't able to get a valid response. Please try again."); return false; }`;
  }

  private addContentStepToScript(contentConfig: ContentStepConfig): string {
    return `return workflowCtx.showContent(\`${contentConfig.content}\`);`;
  }

  private addEndpointStepToScript(endpointConfig: EndpointStepConfig): string {
    let script = "return workflowCtx.showEndpoint({";
    script += `description: "${endpointConfig.description}",`;
    script += `endpointPermalink: "${endpointConfig.endpointPermalink}",`;
    script += `args: { /*Add endpoint parameters with desired values to override the default values here.*/ },`;
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

  private async formatScript(code: string): Promise<string> {
    return prettier.format(code, {
      parser: "babel",
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "es5"
    });
  }
}
