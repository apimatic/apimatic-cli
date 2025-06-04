import * as fs from "fs";
import * as prettier from "prettier";
import { SerializableRecipe, ContentStepConfig, EndpointStepConfig } from "../../types/portal/recipe";
import { Result } from "../../types/common/result";

export class RecipeGenerator {
  private recipe: Map<string, SerializableRecipe> = new Map();

  public async createRecipe(workflowData: SerializableRecipe): Promise<string> {
    this.recipe.set(workflowData.name, workflowData);
    return await this.generateScript(workflowData);
  }

  private async generateScript(recipe: SerializableRecipe): Promise<string> {
    let script = `async function SampleWorkflow(workflowCtx, portal) {`;
    script += "return {";

    recipe.steps.forEach((step, index) => {
      script += `"${step.key}": {`;
      script += `name: "${step.name}",`;
      script += "stepCallback: async () => {";

      if (step.type === "content") {
        const contentConfig = step.config as ContentStepConfig;
        script += `return workflowCtx.showContent(\`${contentConfig.content}\`);`;
      } else if (step.type === "endpoint") {
        const endpointConfig = step.config as EndpointStepConfig;
        script += "return workflowCtx.showEndpoint({";
        script += `description: "${endpointConfig.description}",`;
        script += `endpointPermalink: "${endpointConfig.endpointPermalink}",`;
        script += `args: ${JSON.stringify(endpointConfig.args)},`;
        script += "verify: (response, setError) => {";
        script += this.generateVerifyFunction();
        script += "},";
        script += "});";
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

  private generateVerifyFunction(): string {
    return `if (response.StatusCode == 200) { return true; } else { setError("API Call wasn't able to get a valid response. Please try again."); return false; }`;
  }

  private serializeWorkflow(workflowName: string): Result<string, string> {
    const workflow = this.recipe.get(workflowName);
    if (!workflow) {
      return Result.failure(`Workflow ${workflowName} not found`);
    }
    return Result.success(JSON.stringify(workflow, null, 2));
  }

  public deserializeWorkflow(jsonString: string): SerializableRecipe {
    return JSON.parse(jsonString) as SerializableRecipe;
  }

  public async saveWorkflowToFile(workflowName: string, filePath: string, format: boolean = true): Promise<void> {
    const workflow = this.recipe.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow ${workflowName} not found`);
    }

    let script = await this.generateScript(workflow);

    if (format) {
      script = await this.formatScript(script);
    }

    fs.writeFileSync(filePath, script, "utf8");
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
