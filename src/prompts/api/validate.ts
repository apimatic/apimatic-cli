import { log } from "@clack/prompts";
import { replaceHTML } from "../../utils/utils.js";
import { ValidationMessages } from "../../types/utils.js";
import { Result } from "neverthrow";
import { ApiValidationSummary } from "@apimatic/sdk";
import { ServiceError } from "../../infrastructure/api-utils.js";
import { FilePath } from "../../types/file/filePath.js";
import { format as f } from "../format.js";
import { withSpinner } from "../prompt.js";

export class ApiValidatePrompts {
  public async validateApi(fn: Promise<Result<ApiValidationSummary, string>>) {
    return withSpinner("Validating API", "API validation completed", "API validation failed", fn);
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
    const message = serviceError.errorMessage;
    log.error(message);
  }

  public transformedApiSaved(filePath: FilePath): void {
    log.info(`Transformed API has been saved to ${f.path(filePath)}.`);
  }
}
