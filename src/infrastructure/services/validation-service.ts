import { createReadStream } from "node:fs";
import fsExtra from "fs-extra";
import {
  ApiResponse,
  ApiValidationV2ExternalApisController,
  ValidateApiResult,
  ContentType,
  FileWrapper,
  ApiError,
  RemovableFeature,
  FeaturesToRemove
} from "@apimatic/sdk";

import { DirectoryPath } from "../../types/file/directoryPath.js";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { apiClientFactory } from "./api-client-factory.js";
import { err, ok, Result } from "neverthrow";
import { FilePath } from "../../types/file/filePath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import AxiosService from "../axios-service.js";
import FormData from "form-data";
import { handleServiceError, ServiceError } from "../service-error.js";

export interface ValidateViaFileParams {
  file: FilePath;
  commandMetadata: CommandMetadata;
  authKey?: string | null;
}

export interface UnallowedFeaturesResponse {
  Features: RemovableFeature[];
  EndpointLimit: number;
  EndpointCount: number;
}

export interface ValidateApiResponse {
  result: ValidateApiResult;
  unallowedFeatures: UnallowedFeaturesResponse | null;
}

export class ValidationService {
  constructor(private readonly configDir: DirectoryPath) {}

  async validateViaFile({
    file,
    commandMetadata,
    authKey
  }: ValidateViaFileParams): Promise<Result<ValidateApiResponse, string>> {
    const authInfo: AuthInfo | null = await getAuthInfo(this.configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const controller = new ApiValidationV2ExternalApisController(client);

    try {
      const fileDescriptor = new FileWrapper(fsExtra.createReadStream(file.toString()));
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

      const validation: ApiResponse<ValidateApiResult> = await controller.validateApiViaFileV2(
        ContentType.EnumMultipartformdata,
        fileDescriptor
      );

      const headerValue = validation.headers?.["x-unallowed-features"];
      let unallowedFeatures: UnallowedFeaturesResponse | null = null;

      if (headerValue) {
        const decodedJson = globalThis.Buffer.from(headerValue, "base64").toString("utf8");
        const parsed = JSON.parse(decodedJson);

        unallowedFeatures = parsed as UnallowedFeaturesResponse;
      }

      return ok({
        result: validation.result as ValidateApiResult,
        unallowedFeatures
      });
    } catch (error) {
      return err(await this.handleValidationErrors(error));
    }
  }

  public async stripUnallowedFeatures(
    specPath: FilePath,
    featuresToRemove: FeaturesToRemove,
    authKey?: string | null
  ): Promise<Result<NodeJS.ReadableStream, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(this.configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);
    const apiService = new AxiosService(process.env.APIMATIC_BASE_URL!);

    apiService.setAuthHeader(authorizationHeader);

    const formData = new FormData();
    formData.append("file", createReadStream(specPath.toString()));
    formData.append("featuresToRemove", JSON.stringify(featuresToRemove));

    try {
      const response = await apiService.postFormData<FormData, NodeJS.ReadableStream>("/api-features/strip", formData, {
        headers: formData.getHeaders(),
        responseType: "stream",
        validateStatus: () => true
      });

      return ok(response.data);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  private createAuthorizationHeader(authInfo: AuthInfo | null, overrideAuthKey: string | null): string {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  }

  private async handleValidationErrors(error: unknown): Promise<string> {
    if (error instanceof ApiError) {
      const apiError = error as ApiError;

      switch (apiError.statusCode) {
        case 400:
          return "Your API Definition is invalid. Please fix the issues and try again.";
        case 401:
          return "You are not authorized to perform this action. Please run 'auth:login' or provide a valid auth key.";
        case 403:
          return "You do not have permission to perform this action.";
        case 500:
          return "An unexpected error occurred validating the API specification, please try again later. If the problem persists, please reach out to our team at support@apimatic.io";
        default:
          return `Error ${apiError.statusCode}: An error occurred during validation.`;
      }
    }

    return "Unexpected error occurred while validating API specification.";
  }
}
