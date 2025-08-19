import { outro, spinner, log } from "@clack/prompts";
import { getMessageInMagentaColor, getMessageInCyanColor, getMessageInRedColor } from "../../utils/utils.js";
export class ApiValidatePrompts {
  private readonly spin = spinner();

  displayValidationStartMessage(): void {
    this.spin.start(getMessageInCyanColor("🔍 Validating specification file..."));
  }
  
  displayValidationSuccessMessage(): void {
    this.spin.stop(getMessageInMagentaColor("✅ Specification file provided is valid"));
  }

  displayValidationFailureMessage(): void {
    this.spin.stop(getMessageInRedColor("❌ Specification file provided is invalid"));
  }

  displayOutroMessage(): void {
    outro("Validation process completed.");
  }

  logError(message: string): void {
    log.error(getMessageInRedColor(`Error: ${message}`));
  }
}
