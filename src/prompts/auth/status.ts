import { Result } from "neverthrow";
import { SubscriptionInfo } from "../../types/api/account.js";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";
import { withSpinner } from "../format.js";
import { log } from "@clack/prompts";


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
}
