import { Status } from '@apimatic/sdk';
import { err, ok, Result } from 'neverthrow';
import { REQUEST_TIMEOUT_MS } from '../config/axios-config.js';
import { replaceHTML } from '../utils/utils.js';
import { ServiceError } from './service-error.js';
import { sleep } from './timer-extensions.js';

export const TIMING_DEFAULTS = {
  pollIntervalMs: 3000,
  // Past `/portal-artifacts`' own 25-minute limit, so the user reads the server's overrun message.
  generationTimeoutMs: 30 * 60 * 1000,
  requestTimeoutMs: REQUEST_TIMEOUT_MS
};

export type GenerationTimings = Partial<typeof TIMING_DEFAULTS>;

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
    await sleep(pollIntervalMs);

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
      return err(ServiceError.forbidden('Access denied to resource.' + (message ? '\n' + bulleted([message]) : '')));
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

/** Each message under a bullet of its own, any further line of it indented beneath. */
export const bulleted = (messages: string[]): string =>
  messages.map((message) => `- ${message.replaceAll('\n', '\n  ')}`).join('\n');

export const formatValidationErrors: ValidationErrorFormatter = (errors) => {
  const messages = Object.values(errors).flat();
  return 'One or more validation errors occurred.' + (messages.length ? '\n' + bulleted(messages) : '');
};

const timedOutMessage = (label: string, budgetMs: number): string => {
  const minutes = Math.floor(budgetMs / 60_000);
  if (minutes < 1) {
    return `${label} timed out.`;
  }
  return `${label} timed out after ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
};

// The server writes its messages as HTML; the terminal gets their text.
const asMessages = (errors: Record<string, unknown> | undefined): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(errors ?? {}).map(([key, messages]) => [
      key,
      (Array.isArray(messages) ? messages : [messages]).map((message) => replaceHTML(String(message)))
    ])
  );
