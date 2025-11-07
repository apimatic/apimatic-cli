import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { UnallowedFeaturesResponse, ValidationService } from "../../infrastructure/services/validation-service.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { ResourceInput } from "../../types/file/resource-input.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { ResourceContext } from "../../types/resource-context.js";
import { ValidationSummary } from "@apimatic/sdk";

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
    displayValidationSummary = true
  ): Promise<ActionResult<UnallowedFeaturesResponse | null>> => {
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
      const validationSummary = validationSummaryResult.value;
      if (displayValidationSummary) {
        if (this.hasValidationIssues(validationSummary.result.validation)) {
          this.prompts.displayValidationSummary(validationSummary.result.validation);
        }
        if (this.hasValidationIssues(validationSummary.result.linting)) {
          this.prompts.displayValidationSummary(validationSummary.result.linting);
        }
      }
      if (!validationSummary.result.validation.isSuccess || !validationSummary.result.linting.isSuccess) {
        return ActionResult.failed();
      }
      return ActionResult.success(validationSummary.unallowedFeatures);
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
