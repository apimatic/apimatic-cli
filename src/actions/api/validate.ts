import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { ValidationService } from "../../infrastructure/services/validate-service.js";
import { FilePath } from "../../types/file/filePath.js";
import { ApiValidationSummary } from "@apimatic/sdk";
import { Result } from "../../types/common/result.js";
import { validateFileInputParams } from "../../infrastructure/api-utils.js";

export class ValidateAction {
  private readonly prompts: ApiValidatePrompts = new ApiValidatePrompts();
  private readonly validationService: ValidationService = new ValidationService();
  private readonly configDir: DirectoryPath;
  private readonly shell: string;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, shell: string, authKey: string | null = null) {
    this.configDir = configDir;
    this.shell = shell;
    this.authKey = authKey;
  }

  public readonly execute = async (file?: FilePath, url?: string): Promise<ActionResult> => {
    const validationResult = await validateFileInputParams(file, url);

    if (!validationResult.isSuccess()) {
      return ActionResult.error(validationResult.error!);
    }

    this.prompts.displayValidationStartMessage();

    let validationSummaryResult: Result<ApiValidationSummary, string>;

    if (file) {
      validationSummaryResult = await this.validationService.validateViaFile({
        file,
        configDir: this.configDir,
        shell: this.shell,
        authKey: this.authKey
      });
    } else {
      validationSummaryResult = await this.validationService.validateViaUrl({
        url: url!,
        configDir: this.configDir,
        shell: this.shell,
        authKey: this.authKey
      });
    }

    if (!validationSummaryResult.isSuccess()) {
      return ActionResult.error(validationSummaryResult.error! || "Validation failed with an unknown error");
    }

    const validationSummary = validationSummaryResult.value;
    if (!validationSummary?.success) {
      this.prompts.displayValidationFailureMessage();
      if (validationSummary) {
        this.prompts.displayValidationMessages(validationSummary);
      }
      return ActionResult.error("Specification file provided is invalid");
    }

    this.prompts.displayValidationSuccessMessage();
    this.prompts.displayValidationMessages(validationSummary);
    return ActionResult.success();
  };
}
