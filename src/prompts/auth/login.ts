import { log } from "@clack/prompts";
import { ServiceError, ServiceErrorCode } from "../../infrastructure/service-error.js";
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
    // A rejected key is the failure this reports, so key off the 401 rather than
    // the network error it was previously matching. Compared by code, not by
    // reference: `unauthorizedWithHint` and friends build fresh instances, so an
    // identity check silently stops matching. Anything else (unreachable server,
    // server error) already describes itself accurately.
    const message =
      serviceError.code === ServiceErrorCode.UnAuthorized
        ? ServiceError.unauthorizedWithHint("Invalid API key provided.").errorMessage
        : serviceError.errorMessage;
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
