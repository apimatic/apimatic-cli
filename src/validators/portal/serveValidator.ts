import { Result } from "../../types/common/result.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { DirectoryValidator } from "../common/directoryValidator.js";
import { PortValidator } from "../common/portValidator.js";

export class PortalServeValidator {
  private readonly portValidator: PortValidator;
  private readonly directoryValidator: DirectoryValidator;

  constructor() {
    this.portValidator = new PortValidator();
    this.directoryValidator = new DirectoryValidator();
  }

  public async validateFlagsAndPaths(flags: ServeFlags, paths: ServePaths) : Promise<Result<string, string>> {
    const portValidationResult = await this.portValidator.validate(flags.port);
    if (portValidationResult.isFailed())
    {
      return Result.failure(portValidationResult.error!);
    }
    
    const sourceDirectoryValidationResult = this.directoryValidator.validateSourceDirectory(paths.sourceDirectoryPath);
    if (sourceDirectoryValidationResult.isFailed()) {
      return Result.failure(sourceDirectoryValidationResult.error!);
    }

    const destinationDirectoryValidationResult = await this.directoryValidator.validateDestinationDirectory(paths.destinationDirectoryPath);
    if (destinationDirectoryValidationResult.isFailed()) {
      return Result.failure(destinationDirectoryValidationResult.error!);
    }

    const specDirectoryValidationResult = this.directoryValidator.validateSpecDirectory(paths.sourceDirectoryPath);
    if (specDirectoryValidationResult.isFailed()) {
      return Result.failure(specDirectoryValidationResult.error!);
    }

    return Result.success("Serve flags validated successfully.");
  }
}
