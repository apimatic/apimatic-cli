import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { ApiValidatePrompts } from "../../prompts/api/validate.js";
import { ValidationService } from "../../infrastructure/services/validate-service.js";
import { ApiValidationSummary } from "@apimatic/sdk";
import { Result } from "neverthrow";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { ResourceInput, resolveSpecFilePath } from "../../types/file/resource-input.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";

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

  public readonly execute = async (resourcePath: ResourceInput): Promise<ActionResult> => {
    return await withDirPath(async (tempDirectory) => {
      const specFileResult = await resolveSpecFilePath(tempDirectory, resourcePath.path.toString());
      if (specFileResult.isErr()) {
        this.prompts.InvalidFilePathProvided();
        return ActionResult.failed();
      }
      let validationSummaryResult: Result<ApiValidationSummary, string>;
      validationSummaryResult = await this.prompts.ValidateApi(
        this.validationService.validateViaFile({
          file: specFileResult.value,
          configDir: this.configDir,
          commandMetadata: this.commandMetadata,
          authKey: this.authKey
        })
      );

      if (validationSummaryResult.isErr()) {
        this.prompts.logValidationError(validationSummaryResult.error);
        return ActionResult.failed();
      }
      const validationSummary = validationSummaryResult.value;
      if (validationSummary?.success) {
        this.prompts.displayValidationMessages(validationSummary);
        return ActionResult.success();
      } else {
        this.prompts.displayValidationMessages(validationSummary);
        return ActionResult.failed();
      }
    });
  };
}
