import { outro, spinner, log } from "@clack/prompts";
import {
  getMessageInCyanColor,
  getMessageInRedColor,
  replaceHTML,
} from "../../utils/utils.js";
import { ValidationMessages } from "../../types/utils.js";

export class ApiValidatePrompts {
  private readonly spin = spinner();

  displayValidationStartMessage(): void {
    this.spin.start(getMessageInCyanColor("🔍 Validating specification file..."));
  }

  displayValidationSuccessMessage(): void {
    this.spin.stop("Specification file provided is valid");
  }

  displayValidationFailureMessage(): void {
    this.spin.stop(`Specification validation failed`);
  }

  stopSpin(): void {
    this.spin.stop();
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

  displayOutroMessage(): void {
    outro("Validation process completed.");
  }

  logError(message: string): void {
    log.error(getMessageInRedColor(`Error: ${message}`));
  }
}
