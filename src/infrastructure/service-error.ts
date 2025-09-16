import axios from "axios";
import { format as f } from "../prompts/format.js";

export class ServiceError {
  private static defaultErrorMessage = `An unexpected error occurred, please try again later. If the problem persists, please reach out to our team at ${f.var(
    "support@apimatic.io"
  )}`;

  static readonly NotFound = new ServiceError("NOT_FOUND", "Resource not found.");
  static readonly ServerError = new ServiceError("SERVER_ERROR", this.defaultErrorMessage);
  static readonly NetworkError = new ServiceError("NETWORK_ERROR", "Unable to connect to the server.");
  static readonly InvalidResponse = new ServiceError("INVALID_RESPONSE", this.defaultErrorMessage);
  static readonly UnAuthorized = new ServiceError("UNAUTHORIZED", "Unauthorized access.");
  static badRequest(customMessage: string): ServiceError {
    return new ServiceError("BAD_REQUEST", customMessage);
  }
  static forbidden(customMessage: string): ServiceError {
    return new ServiceError("FORBIDDEN", customMessage);
  }

  static readonly values: ServiceError[] = [
    ServiceError.NotFound,
    ServiceError.ServerError,
    ServiceError.NetworkError,
    ServiceError.InvalidResponse,
    ServiceError.UnAuthorized
  ];

  private constructor(public readonly code: string, private readonly defaultMessage: string) {}

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
