import { log } from "@clack/prompts";
import { replaceHTML } from "../../utils/utils.js";
import { ValidationMessages } from "../../types/utils.js";
import { Result } from "neverthrow";
import { withSpinner } from "../format.js";
import { ApiValidationSummary } from "@apimatic/sdk";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";

export class ApiValidatePrompts {
  public async validateApi(fn: Promise<Result<ApiValidationSummary, string>>) {
    return withSpinner("Validating API", "API validated successfully.", "API validation failed.", fn);
  }

  displayValidationMessages({ warnings, errors, messages }: ValidationMessages): void {
    if (messages.length > 0) {
      log.info("Messages");
      messages.forEach((msg) => {
        log.message(`${replaceHTML(msg)}`);
      });
    }
    if (warnings.length > 0) {
      log.warning("Warnings");
      warnings.forEach((war) => {
        log.message(`${replaceHTML(war)}`);
      });
    }
    if (errors.length > 0) {
      log.error("Errors");
      errors.forEach((err) => {
        log.message(`${replaceHTML(err)}`);
      });
    }
  }

  logValidationError(error: string): void {
    log.error(error);
  }

  public networkError(serviceError: ServiceError): void {
    const message = getErrorMessage(serviceError);
    log.error(message);
  }
}
