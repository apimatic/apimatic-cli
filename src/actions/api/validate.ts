import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { ValidationService } from "../../infrastructure/services/validate-service.js";
import { FilePath } from "../../types/file/filePath.js";
import { ApiValidationSummary } from "@apimatic/sdk";
import { Result } from "../../types/common/result.js";
import { validateFileInputParams } from "../../infrastructure/api-utils.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";

export class ValidateAction {
  private readonly prompts: ApiValidatePrompts = new ApiValidatePrompts();
  private readonly validationService: ValidationService = new ValidationService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.authKey = authKey;
    this.commandMetadata = commandMetadata;
  }

  public readonly execute = async (file?: FilePath, url?: string): Promise<ActionResult> => { // SPECPATH, useQuickstartPrompts = false
    const validationResult = await validateFileInputParams(file, url);

    if (!validationResult.isSuccess()) {
      // TODO: Render the error message here
      //return ActionResult.error(validationResult.error!);
      return ActionResult.failed();
    }

    this.prompts.displayValidationStartMessage();

    let validationSummaryResult: Result<ApiValidationSummary, string>;

    if (file) {
      validationSummaryResult = await this.validationService.validateViaFile({
        file,
        configDir: this.configDir,
        commandMetadata: this.commandMetadata,
        authKey: this.authKey
      });
    } else {
      validationSummaryResult = await this.validationService.validateViaUrl({
        url: url!,
        configDir: this.configDir,
        commandMetadata: this.commandMetadata,
        authKey: this.authKey
      });
    }

    if (!validationSummaryResult.isSuccess()) {
      // TODO: Render the error message here
      //return ActionResult.error(validationSummaryResult.error! || "Validation failed with an unknown error");
      return ActionResult.failed();
    }

    const validationSummary = validationSummaryResult.value;
    if (!validationSummary?.success) {
      this.prompts.displayValidationFailureMessage();
      if (validationSummary) {
        this.prompts.displayValidationMessages(validationSummary);
      }
      // TODO: Render the error message here
      //return ActionResult.error("Specification file provided is invalid");
      return ActionResult.failed();
    }

    this.prompts.displayValidationSuccessMessage();
    this.prompts.displayValidationMessages(validationSummary);
    return ActionResult.success();
  };
}
