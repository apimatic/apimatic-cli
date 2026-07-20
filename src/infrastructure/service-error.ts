import axios from "axios";
import { ApiError } from "@apimatic/sdk";
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
  static forbidden(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.Forbidden, customMessage, {});
  }
  static notFound(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.NotFound, customMessage, {});
  }
  static unauthorized(apiMessage: string | null): ServiceError {
    const message = `${apiMessage ?? "You are not authorized to perform this action."} Please run ${f.cmdAlt(
      "apimatic",
      "auth",
      "login"
    )} to log in, or provide a valid auth key using the ${f.flag("auth-key")} flag.`;
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

// SDK controllers throw typed `ApiError`s (not axios errors). The API reports
// the reason as {"message": "..."} deserialized into `result`.
function mapApiError(error: ApiError): ServiceError {
  if (error.statusCode === 401) {
    const apiMessage = (error.result as { message?: string } | undefined)?.message ?? null;
    return ServiceError.unauthorized(apiMessage);
  }
  if (error.statusCode === 404) return ServiceError.NotFound;
  return ServiceError.ServerError;
}

export function handleServiceError(error: unknown): ServiceError {
  if (error instanceof ApiError) return mapApiError(error);

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
