import fsExtra from "fs-extra";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { ValidationService } from "../../infrastructure/services/validate-service.js";
import { FilePath } from "../../types/file/filePath.js";
import { ApiValidationSummary } from "@apimatic/sdk";
import { Result } from "../../types/common/result.js";

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
    const validationResult = await this.validateFileInputParams(file, url);
    
    if(!validationResult.isSuccess()) {      
      return ActionResult.error(validationResult.error!);
    }

    this.prompts.displayValidationStartMessage();

    let validationSummaryResult : Result<ApiValidationSummary, string>;

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

  private async validateFileInputParams(file: FilePath | undefined, url: string | undefined): Promise<Result<string, string>> {
    if (!file && !url) {
      return Result.failure("Please provide either a specification file or URL");
    }

    if (file && url) {
      return Result.failure("Please provide either a file or URL, not both");
    }

    if (file) {
      if (!(await fsExtra.pathExists(file.toString()))) {
        return Result.failure(`Validation file: ${file} does not exist`);
      }
      const fileStatus = await fsExtra.stat(file.toString());
      if (fileStatus.isDirectory()) {
        return Result.failure("The provided path is a directory. Please provide a valid specification file.");
      }
    }

    return Result.success("");
  }
}