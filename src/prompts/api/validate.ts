import { outro, spinner, log } from "@clack/prompts";
import { getMessageInCyanColor, getMessageInGreenColor, getMessageInRedColor, replaceHTML } from "../../utils/utils.js";
import { ValidationMessages } from "../../types/utils.js";
import { Result } from "neverthrow";
import { withSpinner } from "../format.js";
import { ApiValidationSummary } from "@apimatic/sdk";

export class ApiValidatePrompts {
  private readonly spin = spinner();

  displayValidationStartMessage(): void {
    this.spin.start(getMessageInCyanColor("🔍 Validating specification file..."));
  }

  displayValidationSuccessMessage(): void {
    this.spin.stop(getMessageInGreenColor("Specification file provided is valid"));
  }

  displayValidationFailureMessage(): void {
    this.spin.stop(getMessageInRedColor("Specification validation failed"));
  }

  public async ValidateApi(fn: Promise<Result<ApiValidationSummary, string>>) {
    return withSpinner("Validating API", "API validated successfully.", "API validation failed.", fn);
  }

  displayValidationMessages({ warnings, errors, messages }: ValidationMessages): void {
    const singleError: string = errors.join("\n") || "";

    messages.forEach((message) => {
      log.message(getMessageInCyanColor(`${replaceHTML(message)}`));
    });
    warnings.forEach((warning) => {
      log.warn(`${replaceHTML(warning)}`);
    });
    if (errors.length > 0) {
      log.error(getMessageInRedColor(`${replaceHTML(singleError)}`));
    }
  }

  displayOutroMessage(): void {
    outro("Validation complete");
  }

  logError(error: string): void {
    log.error(error);
  }
}
