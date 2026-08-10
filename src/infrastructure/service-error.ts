import axios from "axios";
import { ApiError, ProblemDetailsError } from "@apimatic/sdk";
import { format as f } from "../prompts/format.js";
import { discardStreamBody } from "../utils/utils.js";

export enum ServiceErrorCode {
  NotFound = "NOT_FOUND",
  ServerError = "SERVER_ERROR",
  NetworkError = "NETWORK_ERROR",
  InvalidResponse = "INVALID_RESPONSE",
  UnAuthorized = "UNAUTHORIZED",
  BadRequest = "BAD_REQUEST",
  Forbidden = "FORBIDDEN",
  Timeout = "TIMEOUT"
}

export class ServiceError {
  private static defaultErrorMessage = `An unexpected error occurred, please try again later. If the problem persists, please reach out to our team at ${f.var(
    "support@apimatic.io"
  )}`;

  static readonly NotFound = new ServiceError(ServiceErrorCode.NotFound, "Resource not found.", {});
  static readonly ServerError = new ServiceError(ServiceErrorCode.ServerError, this.defaultErrorMessage, {});
  static readonly NetworkError = new ServiceError(ServiceErrorCode.NetworkError, "Unable to connect to the server.", {});
  static readonly InvalidResponse = new ServiceError(ServiceErrorCode.InvalidResponse, this.defaultErrorMessage, {});
  static readonly UnAuthorized = new ServiceError(ServiceErrorCode.UnAuthorized, "Unauthorized access.", {});
  static badRequest(customMessage: string, errors: Record<string, string[]>): ServiceError {
    return new ServiceError(ServiceErrorCode.BadRequest, customMessage, errors);
  }
  static forbidden(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.Forbidden, customMessage, {});
  }
  static notFound(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.NotFound, customMessage, {});
  }
  static timeout(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.Timeout, customMessage, {});
  }
  static serverError(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.ServerError, customMessage, {});
  }
  static unauthorizedWithHint(apiMessage: string | null): ServiceError {
    // Both remedies name the full `auth login` command: the key is supplied to
    // that command, not to whichever one hit the 401 — most of them don't accept
    // an --auth-key flag at all.
    const loginCommand = f.cmdAlt("apimatic", "auth", "login");
    const message =
      `${apiMessage ?? "Authorization has been denied for this request."} ` +
      `Please run ${loginCommand} to log in via browser, ` +
      `or provide a valid auth key using the ${loginCommand} ${f.flag("auth-key")}`;
    return new ServiceError(ServiceErrorCode.UnAuthorized, message, {});
  }

  static readonly values: ServiceError[] = [
    ServiceError.NotFound,
    ServiceError.ServerError,
    ServiceError.NetworkError,
    ServiceError.InvalidResponse,
    ServiceError.UnAuthorized
  ];

  private constructor(
    public readonly code: ServiceErrorCode,
    private readonly defaultMessage: string,
    private readonly errors: Record<string, string[]>
  ) {}

  public get errorMessage(): string {
    return this.defaultMessage;
  }

  public getError(key: string): string[] | undefined {
    return this.errors[key];
  }
}

// A ProblemDetails body carries a `title` plus a map of field errors; surface
// the title and the first field message.
function mapProblemDetailsError(error: ProblemDetailsError): ServiceError | null {
  // ProblemDetails.title and .errors are optional and result may be absent — guard
  // all three so a sparse body can't crash or render a trailing "- null".
  // TODO: This only picks the first error message, improve it to show all errors.
  const errors = (error.result?.errors ?? {}) as Record<string, string[]>;
  const firstFieldMessage = Object.values(errors)[0]?.[0];
  const title = error.result?.title ?? "Request failed.";
  const errorMessage = firstFieldMessage ? `${title}\n- ${firstFieldMessage}` : title;
  if (error.statusCode === 400) return ServiceError.badRequest(errorMessage, errors);
  if (error.statusCode === 403) return ServiceError.forbidden(errorMessage);
  return null;
}

// SDK controllers throw typed `ApiError`s (not axios errors). The API reports
// the reason as {"message": "..."} deserialized into `result`.
function mapApiError(error: ApiError): ServiceError {
  if (error instanceof ProblemDetailsError) {
    const serviceError = mapProblemDetailsError(error);
    if (serviceError) return serviceError;
  }
  if (error.statusCode === 401) {
    const apiMessage = (error.result as { message?: string } | undefined)?.message ?? null;
    return ServiceError.unauthorizedWithHint(apiMessage);
  }
  if (error.statusCode === 404) return ServiceError.NotFound;
  return ServiceError.ServerError;
}

export function handleServiceError(error: unknown): ServiceError {
  if (error instanceof ApiError) {
    // A `callAsStream` error body would otherwise hang the CLI. Order against
    // `mapApiError` is free: `error.result` is only populated when the SDK
    // drained the body itself, so a live stream and a readable `result` never
    // coexist.
    const serviceError = mapApiError(error);
    discardStreamBody(error.body);
    return serviceError;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return ServiceError.UnAuthorized;
    if (status === 404) return ServiceError.NotFound;
    if (status === 500) return ServiceError.ServerError;

    if (error.code === "ECONNABORTED" || error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return ServiceError.NetworkError;
    }
  }

  return ServiceError.ServerError;
}
