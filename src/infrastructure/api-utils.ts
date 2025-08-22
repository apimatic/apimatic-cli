import axios from "axios";
import fsExtra from "fs-extra";
import { Result } from "../types/common/result.js";
import { FilePath } from "../types/file/filePath.js";
import { UrlPath } from "../types/file/urlPath.js";

export const enum ServiceError {
  NotFound = "NOT_FOUND",
  ServerError = "SERVER_ERROR",
  NetworkError = "NETWORK_ERROR",
  InvalidResponse = "INVALID_RESPONSE",
  UnAuthorized = "UNAUTHORIZED"
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
      return ServiceError.UnAuthorized;
    }
    if (error.response?.status === 404) {
      return ServiceError.NotFound;
    }
    if (error.response?.status === 500) {
      return ServiceError.ServerError;
    }
    if (error.code === "ECONNABORTED" || error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return ServiceError.NetworkError;
    }
  }
  return ServiceError.ServerError;
}

export async function validateFileInputParams(
  file: FilePath | undefined,
  url: UrlPath | undefined
): Promise<Result<string, string>> {
  if (!file && !url) {
    return Result.failure("Please provide either a specification file or URL");
  }

  if (file && url) {
    return Result.failure("Please provide either a file or URL, not both");
  }

  if (file) {
    if (!(await fsExtra.pathExists(file.toString()))) {
      return Result.failure(`Validation file: ${file} does not exist`);
    }
    const fileStatus = await fsExtra.stat(file.toString());
    if (fileStatus.isDirectory()) {
      return Result.failure("The provided path is a directory. Please provide a valid specification file.");
    }
  }

  return Result.success("");
}
