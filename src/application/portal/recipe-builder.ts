import { SerializableRecipe, SerializableStep } from "../../types/portal/recipe";

export class PortalRecipeBuilder {
  private recipe: SerializableRecipe;

  constructor(name: string) {
    this.recipe = {
      name,
      steps: []
    };
  }

  addContentStep(key: string, name: string, content: string): this {
    this.recipe.steps.push({
      key,
      name,
      type: 'content',
      config: { content }
    });
    return this;
  }

  addEndpointStep(
    key: string, 
    name: string, 
    description: string,
    endpointPermalink: string
  ): this {
    this.recipe.steps.push({
      key,
      name,
      type: 'endpoint',
      config: {
        description,
        endpointPermalink,
      }
    });
    return this;
  }

  addSteps(steps: SerializableStep[]): this {
    this.recipe.steps.push(...steps);
    return this;
  }

  build(): SerializableRecipe {
    return this.recipe;
  }
}