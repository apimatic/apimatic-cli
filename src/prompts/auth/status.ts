import { Result } from "neverthrow";
import { SubscriptionInfo } from "../../types/api/account.js";
import { ServiceError } from "../../infrastructure/service-error.js";
import { format } from "../format.js";
import { log } from "@clack/prompts";
import { mapLanguages } from "../../types/sdk/generate.js";
import { withSpinner } from "../prompt.js";

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
      serviceError === ServiceError.UnAuthorized ? "Invalid API key provided." : serviceError.errorMessage;
    log.error(message);
  }

  public showAccountInfo(info: SubscriptionInfo) {
    const languages = mapLanguages(info.allowedLanguages);
    const message = `Account Information:
  Email: ${format.var(info.Email)}
  Allowed Languages: ${languages.map((language) => format.var(language)).join(", ")}`;
    log.info(`${message}`);
  }
}
