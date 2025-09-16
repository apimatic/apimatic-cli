import { log } from "@clack/prompts";
import { ServiceError } from "../../infrastructure/service-error.js";
import { SubscriptionInfo } from "../../types/api/account.js";
import { Result } from "neverthrow";
import { withSpinner } from "../prompt.js";

export class LoginPrompts {
  public loginSuccessful(email: string) {
    log.success(`Successfully logged in as ${email}`);
  }

  public openBrowser() {
    log.info("Please continue with authentication in the opened browser window.");
  }

  public invalidKeyProvided(serviceError: ServiceError) {
    const message =
      serviceError === ServiceError.NetworkError ? "Invalid API key provided." : serviceError.errorMessage;
    log.error(message);
  }

  public loginTimeout() {
    log.error("Authentication timed out. Please try again.");
  }

  public accountInfoSpinner(fn: Promise<Result<SubscriptionInfo, ServiceError>>) {
    return withSpinner(
      "Retrieving your subscription info",
      "Retrieved subscription info",
      "Error retrieving subscription info",
      fn
    );
  }
}
