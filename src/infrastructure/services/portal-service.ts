import { ReadStream } from "fs";
import axios from "axios";
import {
  ApiError,
  ApiResponse,
  SdkGenerationAsyncController,
  ContentType,
  DocsPortalGenerationAsyncController,
  SdkSourceTreeGenerationAsyncController,
  FileWrapper,
  TransformationController,
  Transformation,
  ExportFormats,
  SdkLanguages,
  Status,
  TableOfContentsController,
  StabilityLevelTag,
  V2SdkGenerationController,
} from "@apimatic/sdk";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { parseStreamBodyToJson } from "../../utils/utils.js";
import { TransformationData } from "../../types/api/transform.js";
import { Sdl } from "../../types/sdl/sdl.js";
import { FilePath } from "../../types/file/filePath.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../file-service.js";
import { apiClientFactory } from "./api-client-factory.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { err, ok, Result } from "neverthrow";
import { Language, Stability } from "../../types/sdk/generate.js";
import { handleServiceError, ServiceError } from "../service-error.js";
import {
  formatValidationErrors,
  GENERATION_TIMEOUT_MS,
  pollUntilCompleted,
  STATUS_POLL_INTERVAL_MS,
  ValidationErrorFormatter
} from "../generation-status-poller.js";
import { envInfo } from "../env-info.js";
import { REQUEST_TIMEOUT_MS } from "../../config/axios-config.js";
import { SemVersion } from "../../types/publish/version.js";
import { TocData } from "../../types/toc/toc-components.js";
import { GenerationStatusResponse } from "../../types/api/generation-status.js";

export interface GeneratedSdkResult {
  sdk: NodeJS.ReadableStream;
  sdkSourceTree: NodeJS.ReadableStream;
}

export class PortalService {
  private readonly CONTENT_TYPE = ContentType.EnumMultipartformdata;
  private readonly apiBaseUrl = "https://api.apimatic.io" as const;
  private readonly fileService = new FileService();
  private readonly statusPollIntervalMs: number;
  private readonly generationTimeoutMs: number;
  private readonly requestTimeoutMs: number;

  constructor(
    statusPollIntervalMs: number = STATUS_POLL_INTERVAL_MS,
    generationTimeoutMs: number = GENERATION_TIMEOUT_MS,
    requestTimeoutMs: number = REQUEST_TIMEOUT_MS
  ) {
    this.statusPollIntervalMs = statusPollIntervalMs;
    this.generationTimeoutMs = generationTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  // TODO: Pass stream as parameter instead of file path.
  public async generatePortal(
    buildPath: FilePath,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null
  ): Promise<Result<NodeJS.ReadableStream, ServiceError | NodeJS.ReadableStream>> {
    const buildFileStream = await this.fileService.getStream(buildPath);
    const file = new FileWrapper(buildFileStream);

    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const docsPortalAsyncController = new DocsPortalGenerationAsyncController(client);

    let generationId: string;
    try {
      const portalInstance = await docsPortalAsyncController.generateOnPremPortalViaBuildInputAsync(
        this.CONTENT_TYPE,
        file
      );
      generationId = portalInstance.result.id;
    } catch (error) {
      // ProblemDetails (400/403), 401 and other SDK statuses are mapped centrally.
      return err(handleServiceError(error));
    } finally {
      buildFileStream.close();
    }

    const statusResult = await pollUntilCompleted({
      pollIntervalMs: this.statusPollIntervalMs,
      fetchStatus: () =>
        this.getPortalGenerationStatus(generationId, commandMetadata.shell, this.resolveToken(authInfo, authKey)),
      timeout: { budgetMs: this.generationTimeoutMs, label: "Portal generation" }
    });
    if (statusResult.isErr()) {
      return err(statusResult.error);
    }

    try {
      const portalDownloadResponse = await docsPortalAsyncController.downloadGeneratedPortal(generationId);
      return ok(portalDownloadResponse.result as NodeJS.ReadableStream);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 422) {
        return err(error.body as NodeJS.ReadableStream);
      }
      return err(handleServiceError(error));
    }
  }

  // TODO: Pass stream as parameter instead of file path.
  public async generateSdk(
    buildPath: FilePath,
    language: Language,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null,
    version?: SemVersion
  ): Promise<Result<GeneratedSdkResult, ServiceError>> {
    const buildFileStream = await this.fileService.getStream(buildPath);
    const file = new FileWrapper(buildFileStream);

    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const sdkGenerationController = new SdkGenerationAsyncController(client);

    let generationId: string;
    try {
      const response = await sdkGenerationController.generateSdkViaBuildInputAsync(
        this.CONTENT_TYPE,
        file,
        this.languageSdk[language],
        undefined,
        version?.toString()
      );
      generationId = response.result.id;
    } catch (error) {
      return err(handleServiceError(error));
    } finally {
      buildFileStream.close();
    }

    const statusResult = await pollUntilCompleted({
      pollIntervalMs: this.statusPollIntervalMs,
      fetchStatus: () =>
        this.getSdkGenerationStatus(generationId, commandMetadata.shell, this.resolveToken(authInfo, authKey)),
      timeout: { budgetMs: this.generationTimeoutMs, label: "SDK generation" },
      formatValidationError: formatSdkValidationError
    });
    if (statusResult.isErr()) {
      return err(statusResult.error);
    }

    try {
      const sdkResponse = await sdkGenerationController.downloadGeneratedSdk(generationId);
      const sdkSourceTreeController = new SdkSourceTreeGenerationAsyncController(client);
      const sdkSourceTreeResponse = await sdkSourceTreeController.downloadGeneratedSdkSourceTree(generationId);
      return ok({
        sdk: sdkResponse.result as NodeJS.ReadableStream,
        sdkSourceTree: sdkSourceTreeResponse.result as NodeJS.ReadableStream
      });
    } catch (error) {
      return err(handleServiceError(error));
    }
  }

  public async generateV4Sdk(
    buildPath: FilePath,
    language: Language,
    stability: Stability,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null
  ): Promise<Result<NodeJS.ReadableStream, ServiceError>> {
    const buildFileStream = await this.fileService.getStream(buildPath);
    const file = new FileWrapper(buildFileStream);

    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const v2sdkGenerationController = new V2SdkGenerationController(client);

    let generationId: string;
    try {
      const response = await v2sdkGenerationController.generateV2SdkViaBuildInputAsync(
        this.CONTENT_TYPE,
        file,
        this.languageSdk[language],
        this.stabilityTag[stability]
      );
      generationId = response.result.id;
    } catch (error) {
      return err(handleServiceError(error));
    } finally {
      buildFileStream.close();
    }

    const statusResult = await pollUntilCompleted({
      pollIntervalMs: this.statusPollIntervalMs,
      fetchStatus: () =>
        this.getV4SdkGenerationStatus(generationId, commandMetadata.shell, this.resolveToken(authInfo, authKey)),
      timeout: { budgetMs: this.generationTimeoutMs, label: "SDK generation" }
    });
    if (statusResult.isErr()) {
      return err(statusResult.error);
    }

    try {
      const sdkResponse = await v2sdkGenerationController.downloadGeneratedV2Sdk(generationId);
      return ok(sdkResponse.result as NodeJS.ReadableStream);
    } catch (error) {
      return err(handleServiceError(error));
    }
  }

  public async generateSdl(
    specFileStream: ReadStream,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata
  ): Promise<Result<Sdl, ServiceError>> {
    const file = new FileWrapper(specFileStream);
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, null);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const transformationController = new TransformationController(client);

    try {
      const generation: ApiResponse<Transformation> = await transformationController.transformViaFile(
        ContentType.EnumMultipartformdata,
        file,
        ExportFormats.Apimatic,
        this.createOriginQueryParameter(commandMetadata.commandName)
      );

      if (!generation.result.success) {
        return err(ServiceError.InvalidResponse);
      }

      const transformationId = generation.result.id;
      const { result }: TransformationData = await transformationController.downloadTransformedFile(transformationId);
      if ((result as NodeJS.ReadableStream).readable) {
        return ok((await parseStreamBodyToJson(result as NodeJS.ReadableStream)) as Sdl);
      } else {
        return err(ServiceError.InvalidResponse);
      }
    } catch (error) {
      return err(handleServiceError(error));
    }
  }

  public async generateTocData(
    specFileStream: ReadStream,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata
  ): Promise<Result<TocData, ServiceError>> {
    const file = new FileWrapper(specFileStream);
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, null);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const tableOfContentsController = new TableOfContentsController(client);

    try {
      const response = await tableOfContentsController.generateTocData(
        ContentType.EnumMultipartformdata,
        file,
        this.createOriginQueryParameter(commandMetadata.commandName)
      );

      if ((response.result as NodeJS.ReadableStream).readable) {
        return ok((await parseStreamBodyToJson(response.result as NodeJS.ReadableStream)) as TocData);
      } else {
        return err(ServiceError.InvalidResponse);
      }
    } catch (error) {
      return err(handleServiceError(error));
    }
  }

  /**
   * SDK generation reports per-language merge conflicts under a dedicated
   * `sdkMergeFailed` key, which needs its own wording. Everything else falls
   * back to the shared format.
   */
  private createAuthorizationHeader =(authInfo: AuthInfo | null, overrideAuthKey: string | null): string => {
    return `X-Auth-Key ${this.resolveToken(authInfo, overrideAuthKey) ?? ""}`;
  };

  private resolveToken = (authInfo: AuthInfo | null, overrideAuthKey: string | null): string | undefined => {
    return overrideAuthKey || authInfo?.authKey;
  };

  private async getPortalGenerationStatus(
    requestId: string,
    shell: string,
    token: string | undefined
  ): Promise<Result<GenerationStatusResponse, ServiceError>> {
    if (!token) {
      return err(ServiceError.UnAuthorized);
    }

    try {
      const response = await this.axiosInstance(shell, token).get(`/portal/v2/${requestId}/status`, {
        headers: { Accept: "application/json" },
        maxRedirects: 0,
        validateStatus: () => true
      });

      if (response.status === 200) {
        return ok(response.data as GenerationStatusResponse);
      }

      // Once generation finishes, the API redirects to the download location.
      if (response.status === 302) {
        return ok({ status: Status.Completed });
      }

      // `validateStatus` above stops axios throwing, so nothing reaches the
      // catch block — classify the status here, or a mistyped endpoint path and
      // an expired auth key both surface as a generic "unexpected error".
      if (response.status === 401) {
        return err(ServiceError.UnAuthorized);
      }
      if (response.status === 404) {
        return err(ServiceError.NotFound);
      }
      if (response.status === 500) {
        return err(ServiceError.ServerError);
      }

      return err(ServiceError.InvalidResponse);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  private async getSdkGenerationStatus(
    requestId: string,
    shell: string,
    token: string | undefined
  ): Promise<Result<GenerationStatusResponse, ServiceError>> {
    if (!token) {
      return err(ServiceError.UnAuthorized);
    }

    try {
      const response = await this.axiosInstance(shell, token).get(`/sdk/${requestId}/status`, {
        headers: { Accept: "application/json" },
        maxRedirects: 0,
        validateStatus: () => true
      });

      if (response.status === 200) {
        return ok(response.data as GenerationStatusResponse);
      }

      // Once generation finishes, the API redirects to the download location.
      if (response.status === 302) {
        return ok({ status: Status.Completed });
      }

      // `validateStatus` above stops axios throwing, so nothing reaches the
      // catch block — classify the status here, or a mistyped endpoint path and
      // an expired auth key both surface as a generic "unexpected error".
      if (response.status === 401) {
        return err(ServiceError.UnAuthorized);
      }
      if (response.status === 404) {
        return err(ServiceError.NotFound);
      }
      if (response.status === 500) {
        return err(ServiceError.ServerError);
      }

      return err(ServiceError.InvalidResponse);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  private async getV4SdkGenerationStatus(
    requestId: string,
    shell: string,
    token: string | undefined
  ): Promise<Result<GenerationStatusResponse, ServiceError>> {
    if (!token) {
      return err(ServiceError.UnAuthorized);
    }

    try {
      const response = await this.axiosInstance(shell, token).get(`/sdk/v2/${requestId}/status`, {
        headers: { Accept: "application/json" },
        maxRedirects: 0,
        validateStatus: () => true
      });

      if (response.status === 200) {
        return ok(response.data as GenerationStatusResponse);
      }

      // Once generation finishes, the API redirects to the download location.
      if (response.status === 302) {
        return ok({ status: Status.Completed });
      }

      // `validateStatus` above stops axios throwing, so nothing reaches the
      // catch block — classify the status here, or a mistyped endpoint path and
      // an expired auth key both surface as a generic "unexpected error".
      if (response.status === 401) {
        return err(ServiceError.UnAuthorized);
      }
      if (response.status === 404) {
        return err(ServiceError.NotFound);
      }
      if (response.status === 500) {
        return err(ServiceError.ServerError);
      }

      return err(ServiceError.InvalidResponse);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  private axiosInstance(shell: string, apiKey: string) {
    return axios.create({
      baseURL: envInfo.getBaseUrl() ?? this.apiBaseUrl,
      timeout: this.requestTimeoutMs,
      headers: {
        "User-Agent": envInfo.getUserAgent(shell),
        Authorization: `X-Auth-Key ${apiKey}`
      }
    });
  }

  private createOriginQueryParameter = (commandName: string): Record<string, string> => {
    return {
      origin: `APIMATIC CLI ${commandName}`
    };
  };

  private readonly languageSdk: Record<Language, SdkLanguages> = {
    [Language.CSHARP]: SdkLanguages.Csharp,
    [Language.JAVA]: SdkLanguages.Java,
    [Language.PHP]: SdkLanguages.Php,
    [Language.PYTHON]: SdkLanguages.Python,
    [Language.RUBY]: SdkLanguages.Ruby,
    [Language.TYPESCRIPT]: SdkLanguages.Typescript,
    [Language.GO]: SdkLanguages.Go
  };

  private readonly stabilityTag: Record<Stability, StabilityLevelTag> = {
    [Stability.STABLE]: StabilityLevelTag.Stable,
    [Stability.BETA]: StabilityLevelTag.Beta
  };
}

const formatSdkValidationError: ValidationErrorFormatter = (errors) => {
  const sdkMergeFailedLanguages = errors.sdkMergeFailed;
  if (sdkMergeFailedLanguages?.length) {
    return (
      "SDK generation failed for these languages due to merge conflict." +
      "\n- " +
      sdkMergeFailedLanguages.join("\n- ")
    );
  }
  return formatValidationErrors(errors);
};

