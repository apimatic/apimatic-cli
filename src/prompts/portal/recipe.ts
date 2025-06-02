import { spinner, log, text, cancel } from "@clack/prompts";
import { isCancel } from "axios";

export class PortalRecipePrompts {
    private readonly spin = spinner();

    public async recipeNamePrompt(): Promise<string> {
       const recipeName = await text({
            message: `Enter a name for your API Recipe:`,
            validate: (name) => {
                if (!name) {
                    return "Recipe name cannot be empty. Please provide a name for your API Recipe.";
                }
            }
        });

        if (isCancel(recipeName))
        {
            cancel("Operation cancelled.");
            return process.exit(0);
        }

        return (recipeName as string).trim().replace(" ", "-");
    }
}