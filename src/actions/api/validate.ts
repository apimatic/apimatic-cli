import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ActionResult } from '../action-result.js';
import { ApiValidatePrompts } from '../../prompts/api/validate.js';
import { ValidationService } from '../../infrastructure/services/validation-service.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ResourceInput } from '../../types/file/resource-input.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { ResourceContext } from '../../types/resource-context.js';
import { ValidationSummary } from '@apimatic/sdk';

/** `unchecked`: the spec never reached the validation service, or the service did not answer, so nothing is known of it. */
export type SpecCheck = 'valid' | 'invalid' | 'unchecked';

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

  /** `onChecked` hears what the validation found, which the `ActionResult` alone cannot tell apart. */
  public readonly execute = async (
    spec: ResourceInput,
    displayValidationSummary = true,
    onChecked?: (check: SpecCheck) => void
  ): Promise<ActionResult> => {
    const check = await this.check(spec, displayValidationSummary);
    onChecked?.(check);
    return check === 'valid' ? ActionResult.success() : ActionResult.failed();
  };

  private readonly check = async (spec: ResourceInput, displayValidationSummary: boolean): Promise<SpecCheck> => {
    return await withDirPath(async (tempDirectory) => {
      const specFile = await new ResourceContext(tempDirectory).resolveTo(spec);
      if (specFile.isErr()) {
        this.prompts.specUnavailable(specFile.error);
        return 'unchecked';
      }
      const validationSummaryResult = await this.prompts.validateApi(
        this.validationService.validateViaFile({
          file: specFile.value,
          commandMetadata: this.commandMetadata,
          authKey: this.authKey
        })
      );

      if (validationSummaryResult.isErr()) {
        this.prompts.logValidationError(validationSummaryResult.error.message);
        return validationSummaryResult.error.kind === 'rejected' ? 'invalid' : 'unchecked';
      }
      const { validation, linting } = validationSummaryResult.value;
      if (displayValidationSummary) {
        if (this.hasValidationIssues(validation)) {
          this.prompts.displayValidationSummary(validation);
        }
        if (this.hasValidationIssues(linting)) {
          this.prompts.displayValidationSummary(linting);
        }
      }
      return validation.isSuccess && linting.isSuccess ? 'valid' : 'invalid';
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
