import { Status } from '@apimatic/sdk';
import { err, ok, Result } from 'neverthrow';
import { ServiceError } from './service-error.js';

export const STATUS_POLL_INTERVAL_MS = 3000;

/**
 * Set well clear of any plausible run: it exists to end a generation that is stuck, not to
 * cap a slow one. No duration data exists for real runs, so this is the number to revisit
 * if a legitimate generation ever reports a timeout.
 */
export const GENERATION_TIMEOUT_MS = 30 * 60 * 1000;

export interface GenerationStatus {
  status: string;
  errors?: Record<string, unknown>;
}

export type ValidationErrorFormatter = (errors: Record<string, string[]>) => string;

export interface GenerationPoll<T extends GenerationStatus> {
  pollIntervalMs: number;
  fetchStatus: () => Promise<Result<T, ServiceError>>;
  /**
   * Bounds a run whose status never reaches a terminal value. `label` opens the message.
   * The budget is only read between polls, so `fetchStatus` must bound its own request —
   * one that connects and never answers outlives any budget set here.
   */
  timeout: { budgetMs: number; label: string };
  /** Only when the endpoint needs custom validation wording. */
  formatValidationError?: ValidationErrorFormatter;
}

export async function pollUntilCompleted<T extends GenerationStatus>({
  pollIntervalMs,
  fetchStatus,
  timeout,
  formatValidationError = formatValidationErrors
}: GenerationPoll<T>): Promise<Result<T, ServiceError>> {
  const deadline = Date.now() + timeout.budgetMs;

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

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
      const validationErrors = asMessages(errors);
      return err(ServiceError.badRequest(formatValidationError(validationErrors), validationErrors));
    }
    if (status === Status.SubscriptionError) {
      const message = Object.values(asMessages(errors)).flat()[0];
      return err(ServiceError.forbidden('Access denied to resource.' + (message ? '\n- ' + message : '')));
    }

    // Every other status keeps the run alive rather than ending it: an endpoint reporting
    // its own in-flight vocabulary is healthy, and the plugin orchestrator reports
    // `Unknown` until it writes a custom status. The deadline is what stops a genuinely
    // stuck run, and it is read after the status so a run that finished during the last
    // wait still counts.
    if (Date.now() >= deadline) {
      return err(ServiceError.timeout(timedOutMessage(timeout.label, timeout.budgetMs)));
    }
  }
}

export const formatValidationErrors: ValidationErrorFormatter = (errors) => {
  const messages = Object.values(errors).flat();
  return 'One or more validation errors occurred.' + (messages.length ? '\n- ' + messages.join('\n- ') : '');
};

const timedOutMessage = (label: string, budgetMs: number): string => {
  const minutes = Math.floor(budgetMs / 60_000);
  if (minutes < 1) {
    return `${label} timed out.`;
  }
  return `${label} timed out after ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
};

const asMessages = (errors: Record<string, unknown> | undefined): Record<string, string[]> =>
  (errors ?? {}) as Record<string, string[]>;
