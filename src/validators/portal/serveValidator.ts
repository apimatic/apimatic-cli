import { Result } from "../../types/common/result.js";
import { ServePaths } from "../../types/portal/serve.js";
import { DirectoryValidator } from "../common/directoryValidator.js";

export class PortalServeValidator {
  private readonly directoryValidator: DirectoryValidator;

  constructor() {
    this.directoryValidator = new DirectoryValidator();
  }

  public async validateSourceDirectory(paths: ServePaths) : Promise<Result<string, string>> {
    const sourceDirectoryValidationResult = this.directoryValidator.validateSourceDirectory(paths.sourceDirectoryPath);
    if (sourceDirectoryValidationResult.isFailed()) {
      return Result.failure(sourceDirectoryValidationResult.error!);
    }

    return Result.success("Serve flags validated successfully.");
  }
}
