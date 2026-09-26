import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { ApiValidatePrompts } from '../../prompts/api/validate.js';
import { ValidationService } from '../../infrastructure/services/validation-service.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ResourceInput } from '../../types/file/resource-input.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { ResourceContext } from '../../types/resource-context.js';
import { ValidationSummary } from '@apimatic/sdk';

/** `whatStopsTheBuild` leaves out warnings and information, which a wizard has no room for. */
export type ValidationReport = 'everything' | 'whatStopsTheBuild';

export class ValidateAction {
  private readonly prompts: ApiValidatePrompts = new ApiValidatePrompts();
  private readonly validationService: ValidationService;
  private readonly authKey: string | null;
  private readonly commandMetadata: CommandMetadata;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.authKey = authKey;
    this.validationService = new ValidationService(configDir);
    this.commandMetadata = commandMetadata;
  }

  public readonly execute = async (
    resourcePath: ResourceInput,
    report: ValidationReport = 'everything'
  ): Promise<ActionResult> => {
    return await withDirPath(async (tempDirectory) => {
      const resourceContext = new ResourceContext(tempDirectory);
      const specFileDirResult = await resourceContext.resolveTo(resourcePath);
      if (specFileDirResult.isErr()) {
        this.prompts.networkError(specFileDirResult.error);
        return ActionResult.failed();
      }
      const validationSummaryResult = await this.prompts.validateApi(
        this.validationService.validateViaFile({
          file: specFileDirResult.value,
          commandMetadata: this.commandMetadata,
          authKey: this.authKey
        })
      );

      if (validationSummaryResult.isErr()) {
        this.prompts.logValidationError(validationSummaryResult.error);
        return ActionResult.failed();
      }
      const { validation, linting } = validationSummaryResult.value;
      for (const summary of [validation, linting]) {
        if (report === 'everything' && this.hasValidationIssues(summary)) {
          this.prompts.displayValidationSummary(summary);
        }
        if (report === 'whatStopsTheBuild') {
          this.prompts.displayBlockingIssues(summary);
        }
      }
      if (!validation.isSuccess || !linting.isSuccess) {
        return ActionResult.failed();
      }
      return ActionResult.success();
    });
  };

  private hasValidationIssues(summary: ValidationSummary): boolean {
    return (
      summary.blocking.length > 0 ||
      summary.errors.length > 0 ||
      summary.warnings.length > 0 ||
      summary.information.length > 0
    );
  }
}
