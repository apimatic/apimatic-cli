import fsExtra from "fs-extra";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { ValidationService } from "../../infrastructure/services/validate-service.js";

export class ValidateAction {
  private readonly prompts: ApiValidatePrompts = new ApiValidatePrompts();
  private readonly validationService: ValidationService = new ValidationService();
  private readonly configDir: DirectoryPath;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, authKey: string | null = null) {
    this.configDir = configDir;
    this.authKey = authKey;
  }

  public readonly execute = async (
    file?: string,
    url?: string
  ): Promise<ActionResult> => {
    if (file && !(await fsExtra.pathExists(file))) {
      return ActionResult.error(`Validation file: ${file} does not exist`);
    }

    this.prompts.displayValidationStartMessage();

    const result = await this.validationService.validate({
      file,
      url,
      configDir: this.configDir,
      authKey: this.authKey
    });

    if (!result.isSuccess()) {
      this.prompts.displayValidationFailureMessage();
      return ActionResult.error(result.error || "Validation failed with an unknown error");
    }

    this.prompts.displayValidationSuccessMessage();
    return ActionResult.success();
  };
}
