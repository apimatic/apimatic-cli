import axios from "axios";

export const enum ServiceError {
  NotFound = "NOT_FOUND",
  ServerError = "SERVER_ERROR",
  NetworkError = "NETWORK_ERROR",
  InvalidResponse = "INVALID_RESPONSE",
  UnAuthorized = "UNAUTHORIZED",
}

export function getErrorMessage(error: ServiceError): string {
  switch (error) {
    case ServiceError.NetworkError:
      return "Unable to connect to the server.";
    case ServiceError.UnAuthorized:
      return "Unauthorized access.";
    case ServiceError.NotFound:
    case ServiceError.ServerError:
    case ServiceError.InvalidResponse:
    default:
      return "An unexpected error occurred, please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
  }
}

export function handleServiceError(error: unknown): ServiceError {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      return ServiceError.UnAuthorized ;
    }
    if (error.response?.status === 404) {
      return ServiceError.NotFound;
    }
    if (error.response?.status === 500) {
      return ServiceError.ServerError;
    }
    if (error.code === "ECONNABORTED" || error.code === "ECONNREFUSED") {
      return ServiceError.NetworkError;
    }
  }
  return ServiceError.ServerError;
}
