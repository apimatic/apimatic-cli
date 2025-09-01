import { SerializableRecipe, StepType } from "../../../types/recipe/recipe.js";

export class PortalRecipe {
  private readonly recipe: SerializableRecipe;

  constructor(name: string) {
    this.recipe = {
      name,
      steps: []
    };
  }

  addContentStep(key: string, name: string, content: string) {
    this.recipe.steps.push({
      key,
      name,
      type: StepType.Content,
      config: { content }
    });
  }

  addEndpointStep(key: string, name: string, description: string, endpointPermalink: string) {
    this.recipe.steps.push({
      key,
      name,
      type: StepType.Endpoint,
      config: {
        description,
        endpointPermalink
      }
    })
  }

  toSerializableRecipe(): SerializableRecipe {
    return this.recipe;
  }
}
