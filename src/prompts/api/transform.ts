import { outro, spinner, log } from "@clack/prompts";
import { getMessageInMagentaColor, getMessageInCyanColor, getMessageInRedColor } from "../../utils/utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";

export class ApiTransformPrompts {
  private readonly spin = spinner();

  displayApiTransformationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Transforming API"));
  }

  displayApiTransformationSuccessMessage(): void {
    this.spin.stop(getMessageInCyanColor(`API transformed successfully`));
  }

  displayApiTransformationFailureMessage(): void {
    this.spin.stop(getMessageInRedColor("API transformation failed"));
  }

  displayOutroMessage(transformedApiPath: DirectoryPath): void {
    outro(`The transformed API specification can be found at ${transformedApiPath}`);
  }

   logError(error: string): void {
    log.error(error);
  }
}
