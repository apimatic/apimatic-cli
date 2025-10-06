import { log } from "@clack/prompts";
import { replaceHTML } from "../../utils/utils.js";
import { ValidationMessages } from "../../types/utils.js";
import { Result } from "neverthrow";
import { ValidateApiResult, ValidationEntry, ValidationSummary } from "@apimatic/sdk";
import { ServiceError } from "../../infrastructure/service-error.js";
import { FilePath } from "../../types/file/filePath.js";
import { format as f } from "../format.js";
import { withSpinner } from "../prompt.js";

export class ApiValidatePrompts {
  public async validateApi(fn: Promise<Result<ValidateApiResult, string>>) {
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

  formatValidationEntry(entry: ValidationEntry): string {
    let formatted = replaceHTML(entry.message);

    if (entry.fileReference && entry.lineInfo) {
      formatted += ` [${entry.fileReference}:${entry.lineInfo.startLineNumber}:${entry.lineInfo.startLinePosition}]`;
    }

    if (entry.jsonReferencePath) {
      formatted += ` (${entry.jsonReferencePath})`;
    }

    return formatted;
  }

  displayValidationMessagesV2(result: ValidateApiResult): void {
    if (this.hasValidationIssues(result.validation)) {
      log.info("Validation");
      this.displayValidationSummary(result.validation);
    }

    if (this.hasValidationIssues(result.linting)) {
      log.info("Linting");
      this.displayValidationSummary(result.linting);
    }
  }

  private hasValidationIssues(summary: ValidationSummary): boolean {
    return (
      summary.blocking.length > 0 ||
      summary.errors.length > 0 ||
      summary.warnings.length > 0 ||
      summary.information.length > 0
    );
  }

  private displayValidationSummary(summary: ValidationSummary): void {
    // Display blocking issues
    if (summary.blocking.length > 0) {
      log.error("Blocking");
      summary.blocking.forEach((entry) => {
        log.message(`${this.formatValidationEntry(entry)}`);
      });
    }

    if (summary.errors.length > 0) {
      log.error("Errors");
      summary.errors.forEach((entry) => {
        log.message(`${this.formatValidationEntry(entry)}`);
      });
    }

    if (summary.warnings.length > 0) {
      log.warning("Warnings");
      summary.warnings.forEach((entry) => {
        log.message(`${this.formatValidationEntry(entry)}`);
      });
    }

    if (summary.information.length > 0) {
      log.info("Information");
      summary.information.forEach((entry) => {
        log.message(`${this.formatValidationEntry(entry)}`);
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
