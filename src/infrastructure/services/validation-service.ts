import fsExtra from "fs-extra";
import {
  ApiResponse,
  ApiValidationV2ExternalApisController,
  ValidateApiResult,
  ContentType,
  FileWrapper,
  ApiError,
} from "@apimatic/sdk";

import { DirectoryPath } from "../../types/file/directoryPath.js";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { apiClientFactory } from "./api-client-factory.js";
import { err, ok, Result } from "neverthrow";
import { FilePath } from "../../types/file/filePath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";

export interface ValidateViaFileParams {
  file: FilePath;
  commandMetadata: CommandMetadata;
  authKey?: string | null;
}

export class ValidationService {
  constructor(private readonly configDir: DirectoryPath) {}

  async validateViaFile({
    file,
    commandMetadata,
    authKey
  }: ValidateViaFileParams): Promise<Result<ValidateApiResult, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(this.configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const controller = new ApiValidationV2ExternalApisController(client);

    try {
      const fileDescriptor = new FileWrapper(fsExtra.createReadStream(file.toString()));
      //TODO: Update spec to include origin query parameter.
      const validation: ApiResponse<ValidateApiResult> = await controller.validateApiViaFileV2(
        ContentType.EnumMultipartformdata,
        fileDescriptor
      );

      return ok(validation.result as ValidateApiResult);
    } catch (error) {
      return err(await this.handleValidationErrors(error));
    }
  }

  private createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  }

  private async handleValidationErrors(error: unknown): Promise<string> {
    if (error instanceof ApiError) {
      const apiError = error as ApiError;

      if (apiError.statusCode === 400) {
        return "Your API Definition is invalid. Please fix the issues and try again.";
      } else if (apiError.statusCode === 401) {
        return "You are not authorized to perform this action. Please run 'auth:login' or provide a valid auth key.";
      } else if (apiError.statusCode === 403) {
        return "You do not have permission to perform this action.";
      } else if (apiError.statusCode === 500) {
        return "An unexpected error occurred validating the API specification, please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
      }

      return `Error ${apiError.statusCode}: An error occurred during validation.`;
    }

    return "Unexpected error occurred while validating API specification.";
  }
}
