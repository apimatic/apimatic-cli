import { Result } from "../../types/common/result.js";
import { isPortInUse } from "../../utils/utils.js";

export class PortValidator {
  public async validate(port: number): Promise<Result<string, string>> {
    if (isNaN(port) || port < 1 || port > 65535) {
      return Result.failure("The specified port number is invalid. Please enter a valid port.");
    }

    const portInUse = await isPortInUse(port);
    if (portInUse) {
      return Result.failure(`Port ${port} is already in use. Please provide an alternative port number to continue.`);
    }

    return Result.success(`Port ${port} is available.`);
  }
}
