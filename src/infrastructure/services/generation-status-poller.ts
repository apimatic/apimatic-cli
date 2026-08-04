import { Status } from "@apimatic/sdk";
import { err, ok, Result } from "neverthrow";
import { ServiceError } from "../service-error.js";

/**
 * The status payload every APIMatic async generation endpoint returns. Both
 * `PortalGenerationStatusResponse` and `SdkGenerationStatusResponse` from
 * `@apimatic/sdk` are structurally this shape.
 */
export interface GenerationStatusResponse {
  status: Status;
  errors?: Record<string, unknown>;
}

/** Reads the current status of a single in-flight generation request. */
export type FetchGenerationStatus = () => Promise<Result<GenerationStatusResponse, ServiceError>>;

/** Renders a `ValidationError` payload as the message shown to the user. */
export type ValidationErrorFormatter = (errors: Record<string, string[]>) => string;

/** Lists every validation message under a single heading. Default for all endpoints. */
export const formatValidationErrors: ValidationErrorFormatter = (errors) => {
  const messages = Object.values(errors).flat();
  return "One or more validation errors occurred." + (messages.length ? "\n- " + messages.join("\n- ") : "");
};

/**
 * Drives an APIMatic async generation to a terminal state.
 *
 * Every generation endpoint reports progress the same way: poll on an interval
 * until `Completed`, and map `Failed` / `ValidationError` / `SubscriptionError`
 * onto a `ServiceError`. Only the validation message wording varies per
 * endpoint, which callers supply via `formatValidationError`.
 */
export class GenerationStatusPoller {
  private readonly pollIntervalMs: number;

  constructor(pollIntervalMs: number) {
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Polls until the generation completes, waiting one interval before each
   * attempt. Non-terminal states (e.g. `InProgress`) keep the loop running.
   */
  public async pollUntilCompleted(
    fetchStatus: FetchGenerationStatus,
    formatValidationError: ValidationErrorFormatter = formatValidationErrors
  ): Promise<Result<GenerationStatusResponse, ServiceError>> {
    for (;;) {
      await this.wait();

      const statusResult = await fetchStatus();
      if (statusResult.isErr()) {
        return err(statusResult.error);
      }

      const { status, errors } = statusResult.value;

      if (status === Status.Completed) {
        return ok(statusResult.value);
      }
      if (status === Status.Failed) {
        return err(ServiceError.ServerError);
      }
      if (status === Status.ValidationError) {
        const validationErrors = this.asMessages(errors);
        return err(ServiceError.badRequest(formatValidationError(validationErrors), validationErrors));
      }
      if (status === Status.SubscriptionError) {
        const message = Object.values(this.asMessages(errors)).flat()[0];
        return err(ServiceError.forbidden("Access denied to resource." + (message ? "\n- " + message : "")));
      }
    }
  }

  private asMessages(errors: Record<string, unknown> | undefined): Record<string, string[]> {
    return (errors ?? {}) as Record<string, string[]>;
  }

  private wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
  }
}
