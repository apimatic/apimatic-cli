import axios from "axios";
import { format as f } from "../prompts/format.js";

export enum ServiceErrorCode {
  NotFound = "NOT_FOUND",
  ServerError = "SERVER_ERROR",
  NetworkError = "NETWORK_ERROR",
  InvalidResponse = "INVALID_RESPONSE",
  UnAuthorized = "UNAUTHORIZED",
  BadRequest = "BAD_REQUEST",
  Forbidden = "FORBIDDEN"
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
  static forbidden(customMessage: string, errors: Record<string, string[]> = {}): ServiceError {
    return new ServiceError(ServiceErrorCode.Forbidden, customMessage, errors);
  }
  static notFound(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.NotFound, customMessage, {});
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

  /**
   * The keys of the structured errors map. For subscription failures the
   * backend uses these as stable machine codes (e.g. "EndpointLimitExceeded",
   * "FeatureNotAllowed"), letting consumers classify without parsing the message.
   */
  public get errorCodes(): string[] {
    return Object.keys(this.errors);
  }
}

export function handleServiceError(error: unknown): ServiceError {
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
