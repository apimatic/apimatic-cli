import * as fs from "fs-extra";
import { PortalNewTocPrompts } from "../../../prompts/portal/new/toc";
import { Result } from "../../../types/common/result";
import { getMessageInRedColor } from "../../../utils/utils";

export class PortalNewTocAction {
  private readonly prompts: PortalNewTocPrompts;

  constructor() {
    this.prompts = new PortalNewTocPrompts();
  }

  async createToc(tocPath: string): Promise<void> {
    this.prompts.displayTocCreationMessage();

    try {
      // TODO: Implement actual toc file creation logic here
      // This is a placeholder that creates an empty toc file
      await fs.writeFile(tocPath, "# Table of Contents\n", "utf8");

      this.prompts.displayTocCreationSuccessMessage();
      this.prompts.displayOutroMessage(tocPath);
    } catch (error) {
      this.prompts.displayTocCreationErrorMessage();
      this.prompts.logError(
        getMessageInRedColor(`An error occurred while creating the toc file: \n${error}`)
      );
    }
  }
} 