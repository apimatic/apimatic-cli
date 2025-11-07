import { log } from "@clack/prompts";
import { replaceHTML } from "../../utils/utils.js";
import { ValidationMessages } from "../../types/utils.js";
import { Result } from "neverthrow";
import {  ValidationEntry, ValidationSummary } from "@apimatic/sdk";
import { ServiceError } from "../../infrastructure/service-error.js";
import { FilePath } from "../../types/file/filePath.js";
import { format as f } from "../format.js";
import { withSpinner } from "../prompt.js";
import { ValidateApiResponse } from "../../infrastructure/services/validation-service.js";

export class ApiValidatePrompts {
  public async validateApi(fn: Promise<Result<ValidateApiResponse, string>>) {
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

  public displayValidationSummary(summary: ValidationSummary): void {
    if (summary.blocking.length > 0) {
      log.error("Blocking");
      for (const entry of summary.blocking) {
        log.message(this.formatValidationEntry(entry));
      }
    }

    if (summary.errors.length > 0) {
      log.error("Errors");
      for (const entry of summary.errors) {
        log.message(this.formatValidationEntry(entry));
      }
    }

    if (summary.warnings.length > 0) {
      log.warning("Warnings");
      for (const entry of summary.warnings) {
        log.message(this.formatValidationEntry(entry));
      }
    }

    if (summary.information.length > 0) {
      log.info("Information");
      for (const entry of summary.information) {
        log.message(this.formatValidationEntry(entry));
      }
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
