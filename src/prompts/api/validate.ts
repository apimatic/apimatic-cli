import { log } from '@clack/prompts';
import { replaceHTML } from '../../utils/utils.js';
import { listedInProse } from '../../utils/string-utils.js';
import { ValidationMessages } from '../../types/utils.js';
import { Result } from 'neverthrow';
import { ValidateApiResult, ValidationEntry, ValidationSummary } from '@apimatic/sdk';
import { ServiceError } from '../../infrastructure/service-error.js';
import { FilePath } from '../../types/file/filePath.js';
import { SpecZipProblem } from '../../types/project-context.js';
import { format as f } from '../format.js';
import { withSpinner } from '../prompt.js';

export class ApiValidatePrompts {
  public async validateApi<E>(fn: Promise<Result<ValidateApiResult, E>>) {
    return withSpinner('Validating API', 'API validation completed', 'API validation failed', fn);
  }

  displayValidationMessages({ warnings, errors, messages }: ValidationMessages): void {
    if (messages.length > 0) {
      log.info('Messages');
      messages.forEach((msg) => {
        log.message(`${replaceHTML(msg)}`);
      });
    }
    if (warnings.length > 0) {
      log.warn('Warnings');
      warnings.forEach((war) => {
        log.message(`${replaceHTML(war)}`);
      });
    }
    if (errors.length > 0) {
      log.error('Errors');
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
      log.error('Blocking');
      for (const entry of summary.blocking) {
        log.message(this.formatValidationEntry(entry));
      }
    }

    if (summary.errors.length > 0) {
      log.error('Errors');
      for (const entry of summary.errors) {
        log.message(this.formatValidationEntry(entry));
      }
    }

    if (summary.warnings.length > 0) {
      log.warn('Warnings');
      for (const entry of summary.warnings) {
        log.message(this.formatValidationEntry(entry));
      }
    }

    if (summary.information.length > 0) {
      log.info('Information');
      for (const entry of summary.information) {
        log.message(this.formatValidationEntry(entry));
      }
    }
  }

  logValidationError(error: string): void {
    log.error(error);
  }

  public specUnavailable(problem: ServiceError | SpecZipProblem): void {
    if (problem instanceof ServiceError) {
      log.error(problem.errorMessage);
      return;
    }
    switch (problem.kind) {
      case 'noSpec': {
        const message =
          `No API specification found in ${f.path(problem.specDirectory)}. Add yours there, point ` +
          `${f.flag('input')} at the directory that holds ${f.var('src')}, or give a spec with ` +
          `${f.flag('file')} or ${f.flag('url')}.`;
        log.error(message);
        return;
      }
      case 'unreadable': {
        log.error(`${f.path(problem.specDirectory)} could not be read: ${problem.reason}`);
        return;
      }
      case 'symlinks': {
        const names = listedInProse(
          problem.symlinks.map((symlink) => f.var(symlink.relativeTo(problem.specDirectory)))
        );
        const one = problem.symlinks.length === 1;
        const message =
          `${names} in ${f.path(problem.specDirectory)} ${one ? 'is a symlink' : 'are symlinks'}, which cannot ` +
          `be uploaded for validation. Replace ${one ? 'it' : 'each'} with a copy of the files it points to.`;
        log.error(message);
        return;
      }
    }
  }

  public transformedApiSaved(filePath: FilePath): void {
    log.info(`Transformed API has been saved to ${f.path(filePath)}.`);
  }
}
