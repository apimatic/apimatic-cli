import { Result } from "neverthrow";
import { SubscriptionInfo } from "../../types/api/account.js";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";
import { format, withSpinner } from "../format.js";
import { log } from "@clack/prompts";
import { Language } from "../../types/sdk/generate.js";

export class StatusPrompts {
  public accountInfoSpinner(fn: Promise<Result<SubscriptionInfo, ServiceError>>) {
    return withSpinner(
      "Retrieving your subscription info",
      "Retrieved subscription info",
      "Error retrieving subscription info",
      fn
    );
  }

  public invalidKeyProvided(serviceError: ServiceError) {
    const message =
      serviceError === ServiceError.NetworkError ? "Invalid API key provided." : getErrorMessage(serviceError);
    log.error(message);
  }



  public showAccountInfo(info: SubscriptionInfo) {
    const activeLanguages = this.getActiveLanguages(info.allowedLanguages);
    const message = [
      `Email: ${format.var(info.Email)}`,
      `Allowed Languages: ${format.var(activeLanguages.join(", "))}`,
      `Api Copilot ID: ${format.var(info.ApiCopilotKeys.join(" "))}`
    ].join("\n");
    log.info(`Account Information:\n${message}`);
  }




  private getActiveLanguages(flags: number): string[] {
    get
  }
}
