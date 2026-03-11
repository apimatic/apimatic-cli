import axios from "axios";
import { format as f } from "../prompts/format.js";

export enum ServiceErrorCode {
  NotFound = "NOT_FOUND",
  ServerError = "SERVER_ERROR",
  NetworkError = "NETWORK_ERROR",
  InvalidResponse = "INVALID_RESPONSE",
  UnAuthorized = "UNAUTHORIZED",
  BadRequest = "BAD_REQUEST",
  Forbidden = "FORBIDDEN",
  SdkMergeError = "SDK_MERGE_ERROR"
}

export class ServiceError {
  private static defaultErrorMessage = `An unexpected error occurred, please try again later. If the problem persists, please reach out to our team at ${f.var(
    "support@apimatic.io"
  )}`;

  static readonly NotFound = new ServiceError(ServiceErrorCode.NotFound, "Resource not found.");
  static readonly ServerError = new ServiceError(ServiceErrorCode.ServerError, this.defaultErrorMessage);
  static readonly NetworkError = new ServiceError(ServiceErrorCode.NetworkError, "Unable to connect to the server.");
  static readonly InvalidResponse = new ServiceError(ServiceErrorCode.InvalidResponse, this.defaultErrorMessage);
  static readonly UnAuthorized = new ServiceError(ServiceErrorCode.UnAuthorized, "Unauthorized access.");
  static badRequest(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.BadRequest, customMessage);
  }
  static forbidden(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.Forbidden, customMessage);
  }
  static sdkMergeError(customMessage: string): ServiceError {
    return new ServiceError(ServiceErrorCode.SdkMergeError, customMessage);
  }

  static readonly values: ServiceError[] = [
    ServiceError.NotFound,
    ServiceError.ServerError,
    ServiceError.NetworkError,
    ServiceError.InvalidResponse,
    ServiceError.UnAuthorized
  ];

  private constructor(public readonly code: ServiceErrorCode, private readonly defaultMessage: string) {}

  public get errorMessage(): string {
    return this.defaultMessage;
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
