import { toPascalCase } from "../utils/utils.js";
import { FileName } from "./file/fileName.js";
import { Toc } from "./toc/toc.js";

export class RecipeContext {
  constructor(private readonly recipeName: string) {}

  getRecipeName(): FileName {
    return new FileName(toPascalCase(this.recipeName.trim()));
  }

  exists(tocData: Toc, recipeName: string, recipeFileName: FileName): boolean {
    let apiRecipesGroup = tocData.toc?.find((item) => "group" in item && item.group === "API Recipes");
    if (!apiRecipesGroup || !("items" in apiRecipesGroup)) {
      return false;
    }

    // Check if the recipe name or file name already exists
    const existingRecipe = apiRecipesGroup.items.find(
      (item) =>
        "page" in item && "file" in item && (item.page === recipeName || item.file === `recipes/${recipeFileName}.md`)
    );
    return !!existingRecipe;
  }
}
