import { createReadStream } from "node:fs";
import fsExtra from "fs-extra";
import {
  ApiResponse,
  ApiValidationV2ExternalApisController,
  ValidateApiResult,
  ContentType,
  FileWrapper,
  ApiError
} from "@apimatic/sdk";

import { DirectoryPath } from "../../types/file/directoryPath.js";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { apiClientFactory } from "./api-client-factory.js";
import { err, ok, Result } from "neverthrow";
import { FilePath } from "../../types/file/filePath.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import FormData from "form-data";
import { ZipService } from "../zip-service.js";
import { handleServiceError, ServiceError } from "../service-error.js";
import axios from "axios";
import { envInfo } from "../env-info.js";
import { Buffer } from "node:buffer";
import { BuildConfig } from "../../types/build/build.js";

export enum RemovableFeature {
  Merging = 'Merging',
  Pagination = 'Pagination',
  Webhooks = 'Webhooks',
  Callbacks = 'Callbacks',
  MultipleAuthSchemes = 'MultipleAuthSchemes',
  Oauth2 = 'OAuth2',
}

export interface FeaturesToRemove {
  features?: RemovableFeature[];
  endpointsToKeep?: number;
}

export interface ValidateViaFileParams {
  file: FilePath;
  commandMetadata: CommandMetadata;
  authKey?: string | null;
}

export interface UnallowedFeaturesResponse {
  Features: RemovableFeature[];
  EndpointLimit: number;
  EndpointCount: number;
  IsSplitSpec: boolean;
}

export interface ValidateApiResponse {
  result: ValidateApiResult;
  unallowedFeatures: UnallowedFeaturesResponse | null;
}

export interface BuildFilePruneReport {
  removedLanguages: string[];
  removedApiCopilot: boolean;
  removedAiIntegration: boolean;
}

export interface PruneBuildFileResponse {
  buildFile: BuildConfig;
  report: BuildFilePruneReport;
}

export class ValidationService {
  private readonly apiBaseUrl = "https://api.apimatic.io" as const;
  private readonly zipService = new ZipService();

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

    const formData = new FormData();
    formData.append("file", createReadStream(specPath.toString()));
    formData.append("featuresToRemove", JSON.stringify(featuresToRemove));

    const baseURL = envInfo.getBaseUrl() ?? this.apiBaseUrl;

    try {
      const response = await axios({
        method: "POST",
        url: `${baseURL}/api-features/strip`,
        data: formData,
        headers: {
          ...formData.getHeaders(),
          Authorization: authorizationHeader
        },
        responseType: "stream",
        validateStatus: () => true
      });

      if (response.status >= 400) {
        return err(await this.parseErrorResponse(response));
      }

      return ok(response.data);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  /**
   * Prunes a build file down to what the user's subscription allows (SDK languages +
   * AI features) via the platform, returning the pruned build file and a report of
   * what was removed. The platform is the entitlement authority, so the build we
   * submit for generation is never rejected for a build-file feature the plan lacks.
   */
  public async pruneBuildFile(
    buildConfigFilePath: FilePath,
    authKey?: string | null
  ): Promise<Result<PruneBuildFileResponse, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(this.configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey ?? null);

    const formData = new FormData();
    formData.append("file", createReadStream(buildConfigFilePath.toString()), {
      filename: "APIMATIC-BUILD.json",
      contentType: "application/json"
    });

    const baseURL = envInfo.getBaseUrl() ?? this.apiBaseUrl;

    try {
      const response = await axios({
        method: "POST",
        url: `${baseURL}/build-features/prune`,
        data: formData,
        headers: {
          ...formData.getHeaders(),
          Authorization: authorizationHeader
        },
        // The endpoint returns a zip (pruned APIMATIC-BUILD.json + report.json),
        // so read the raw bytes rather than letting axios parse JSON.
        responseType: "arraybuffer",
        validateStatus: () => true
      });

      if (response.status >= 400) {
        return err(this.parsePruneErrorResponse(response.status, response.data));
      }

      const zipData = globalThis.Buffer.from(response.data as ArrayBuffer);
      const buildEntry = this.zipService.readEntry(zipData, "APIMATIC-BUILD.json");
      const reportEntry = this.zipService.readEntry(zipData, "report.json");
      if (!buildEntry || !reportEntry) {
        return err(
          ServiceError.badRequest("The build-file prune returned an unexpected response.", {})
        );
      }

      const buildFile = BuildConfig.parse(buildEntry.toString("utf-8"));
      const report = JSON.parse(reportEntry.toString("utf-8")) as BuildFilePruneReport;
      return ok({ buildFile, report });
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  /** Decodes an error body that arrived as raw zip-request bytes into a ServiceError. */
  private parsePruneErrorResponse(status: number, data: unknown): ServiceError {
    let message = `Error ${status}: Failed to prune the build file for your subscription.`;
    try {
      const text = globalThis.Buffer.from(data as ArrayBuffer).toString("utf-8");
      const body = JSON.parse(text) as { errors?: { summary?: string[] }; message?: string; title?: string };
      message = body?.errors?.summary?.[0] ?? body?.message ?? body?.title ?? message;
    } catch {
      // Non-JSON / undecodable body — keep the default message.
    }
    return ServiceError.badRequest(message, {});
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

  private async parseErrorResponse(
    response: { status: number; data: AsyncIterable<Buffer> }
  ): Promise<ServiceError> {
    const chunks: Buffer[] = [];
    for await (const chunk of response.data) {
      chunks.push(Buffer.from(chunk));
    }
    const errorBody = Buffer.concat(chunks).toString('utf-8');

    let errorMessage = `Error ${response.status}: Failed to strip unallowed features.`;

    try {
      const errorData = JSON.parse(errorBody);
      if (errorData.errors?.summary?.[0]) {
        errorMessage = errorData.errors.summary[0];
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.title) {
        errorMessage = errorData.title;
      }
    } catch {
      errorMessage = errorBody || errorMessage;
    }

    return {
      message: errorMessage,
      statusCode: response.status
    } as unknown as ServiceError;
  }
}
