import * as fs from "fs";
import * as prettier from "prettier";
import { SerializableRecipe, ContentStepConfig, EndpointStepConfig } from "../../types/portal/recipe";
import { Result } from "../../types/common/result";

export class PortalRecipeGenerator {
  public async createScriptFromRecipe(recipe: SerializableRecipe): Promise<string> {
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
        script += `args: { //Add endpoint parameters with desired values to override the default values here. },`;
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

  public deserializeWorkflow(jsonString: string): SerializableRecipe {
    return JSON.parse(jsonString) as SerializableRecipe;
  }

  public async saveRecipeToFile(script: string, filePath: string, format: boolean = true): Promise<void> {
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
