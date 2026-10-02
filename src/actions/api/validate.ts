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
export type ValidationFailure = 'invalid' | 'unchecked';

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
    spec: ResourceInput | ResourceContext,
    displayValidationSummary = true
  ): Promise<ActionResult<void, ValidationFailure>> => {
    if (!(spec instanceof ResourceContext)) {
      return await withDirPath((tempDirectory) =>
        this.execute(ResourceContext.resolveTo(spec, tempDirectory), displayValidationSummary)
      );
    }
    const specFile = await spec.resolveTo();
    if (specFile.isErr()) {
      this.prompts.specUnavailable(specFile.error);
      return ActionResult.failed(undefined, 'unchecked');
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
      return ActionResult.failed(
        undefined,
        validationSummaryResult.error.kind === 'rejected' ? 'invalid' : 'unchecked'
      );
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
    return validation.isSuccess && linting.isSuccess
      ? ActionResult.success()
      : ActionResult.failed(undefined, 'invalid');
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
