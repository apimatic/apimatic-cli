import fsExtra from "fs-extra";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { ValidationService } from "../../infrastructure/services/validate-service.js";
import { FilePath } from "../../types/file/filePath.js";

export class ValidateAction {
  private readonly prompts: ApiValidatePrompts = new ApiValidatePrompts();
  private readonly validationService: ValidationService = new ValidationService();
  private readonly configDir: DirectoryPath;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, authKey: string | null = null) {
    this.configDir = configDir;
    this.authKey = authKey;
  }

  public readonly execute = async (file?: FilePath, url?: string): Promise<ActionResult> => {
    if (!file && !url) {
      return ActionResult.error("Please provide either a specification file or URL");
    }

    if (file && url) {
      return ActionResult.error("Please provide either a file or URL, not both");
    }

    if (file && !(await fsExtra.pathExists(file.toString()))) {
      return ActionResult.error(`Validation file: ${file} does not exist`);
    }

    this.prompts.displayValidationStartMessage();

    let validationSummaryResult;

    if (file) {
      validationSummaryResult = await this.validationService.validateViaFile({
        file,
        configDir: this.configDir,
        authKey: this.authKey
      });
    } else {
      validationSummaryResult = await this.validationService.validateViaUrl({
        url: url!, 
        configDir: this.configDir,
        authKey: this.authKey
      });
    }

    if (validationSummaryResult.isFailed()) {
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