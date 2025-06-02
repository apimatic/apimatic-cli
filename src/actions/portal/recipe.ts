import * as fs from "fs";
import { PortalRecipePrompts } from "../../prompts/portal/recipe";

export class PortalRecipeAction {
    private readonly prompts: PortalRecipePrompts;
    private readonly markdownFilePath = "resources/portal/api-recipe.md";
    private readonly scriptFilePath = "resources/portal/api-recipe.js";

    constructor() {
        this.prompts = new PortalRecipePrompts();
    }

    public async createRecipe() : Promise<void>
    {
        const recipeName = await this.prompts.recipeNamePrompt();
        await this.createMarkdownFile(recipeName);
    } 

    private async createMarkdownFile(recipeName: string) : Promise<void>
    {
        const directory = "content/api-recipes";
        const markdownFileContent = fs.readFileSync(this.markdownFilePath, "utf-8");
        
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(`${directory}/${recipeName}.md`, markdownFileContent);
    }
}