import { SerializableRecipe, StepType } from "../../../types/recipe/recipe.js";

export class PortalRecipe {
  private readonly recipe: SerializableRecipe;

  constructor(name: string) {
    this.recipe = {
      name,
      steps: []
    };
  }

  addContentStep(key: string, content: string) {
    this.recipe.steps.push({
      key,
      name: key, //TODO: Check if key is required
      type: StepType.Content,
      config: { content }
    });
  }

  addEndpointStep(key: string, description: string, endpointGroupName: string, endpointName: string) {
    const endpointPermalink = `$e/${[endpointGroupName, endpointName].map(encodeURIComponent).join("/")}`;
    this.recipe.steps.push({
      key,
      name: key, //TODO: Check if key is required
      type: StepType.Endpoint,
      config: {
        description,
        endpointPermalink
      }
    });
  }

  toSerializableRecipe(): SerializableRecipe {
    return this.recipe;
  }
}
