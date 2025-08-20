import { outro, spinner, log } from "@clack/prompts";
import { getMessageInMagentaColor, getMessageInCyanColor, getMessageInRedColor, replaceHTML } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ValidationMessages } from "../../types/utils.js";

export class ApiTransformPrompts {
  private readonly spin = spinner();

  displayApiTransformationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Transforming API"));
  }

  displayApiTransformationSuccessMessage(): void {
    this.spin.stop(getMessageInCyanColor(`API transformed successfully`));
  }

  displayApiTransformationFailureMessage(): void {
    this.spin.stop(getMessageInRedColor("API transformation failed"));
  }

  displayValidationMessages({ warnings = [], errors = [], messages = [] }: ValidationMessages): void {
      const singleError: string = errors.join("\n") || "";
  
      messages.forEach((message) => {
        log.message(getMessageInCyanColor(`ℹ️ ${replaceHTML(message)}`));
      });
      warnings.forEach((warning) => {
        log.warn(`⚠️ ${replaceHTML(warning)}`);
      });
      if (errors.length > 0) {
        log.error(getMessageInRedColor(`❌ ${replaceHTML(singleError)}`));
      }
    }

  displayOutroMessage(transformedApiPath: DirectoryPath): void {
    outro(`The transformed API specification can be found at ${transformedApiPath}`);
  }

   logError(error: string): void {
    log.error(error);
  }
}
