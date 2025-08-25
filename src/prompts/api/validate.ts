import { outro, spinner, log } from "@clack/prompts";
import { getMessageInCyanColor, getMessageInRedColor, replaceHTML } from "../../utils/utils.js";
import { ValidationMessages } from "../../types/utils.js";
import { Result } from "neverthrow";
import { withSpinner } from "../format.js";
import { ApiValidationSummary } from "@apimatic/sdk";

export class ApiValidatePrompts {
  private readonly spin = spinner();

  public async ValidateApi(fn: Promise<Result<ApiValidationSummary, string>>) {
    return withSpinner("Validating API", "API validated successfully.", "API validation failed.", fn);
  }

  public async InvalidFilePathProvided() {
    const message = `Invalid file path or URL provided.`;
    log.error(message);
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

  logValidationError(error: string): void {
    log.error(error);
  }
}
