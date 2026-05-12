import { ReadStream } from "fs";
import {
  ApiError,
  ApiResponse,
  SdkGenerationAsyncController,
  ContentType,
  DocsPortalGenerationAsyncController,
  SdkSourceTreeGenerationAsyncController,
  ProblemDetailsError,
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
import { Language } from "../../types/sdk/generate.js";
import { handleServiceError, ServiceError } from "../service-error.js";
import { ApiService } from "./api-service.js";
import { SemVersion } from "../../types/publish/version.js";
import { TocData } from "../../types/toc/toc-components.js";

export interface GeneratedSdkResult {
  sdk: NodeJS.ReadableStream;
  sdkSourceTree: NodeJS.ReadableStream;
}

export class PortalService {
  private readonly CONTENT_TYPE = ContentType.EnumMultipartformdata;
  private readonly fileService = new FileService();
  private readonly apiService = new ApiService();

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
      if (error instanceof ProblemDetailsError) {
        const errors = error.result!.errors as Record<string, string[]>;
        // TODO: This only picks the first error message, improve it to show all errors.
        const message = Object.values(errors)[0]?.[0] ?? null;
        const errorMessage = error.result!.title + "\n- " + message;
        if (error.statusCode === 400) {
          return err(ServiceError.badRequest(errorMessage, errors));
        }
        if (error.statusCode === 403) {
          return err(ServiceError.forbidden(errorMessage));
        }
      }
      const serviceError = handleServiceError(error);
      return err(serviceError);
    } finally {
      buildFileStream.close();
    }

    let statusResult;
    do {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      statusResult = await this.apiService.getPortalGenerationStatus(
        generationId,
        configDir,
        commandMetadata.shell,
        authKey
      );
      if (statusResult.isErr()) {
        return err(statusResult.error);
      }
      if (statusResult.value.status === Status.Failed) {
        return err(ServiceError.ServerError);
      }
      if (statusResult.value.errors && statusResult.value.status === Status.ValidationError) {
        const errors = statusResult.value.errors as Record<string, string[]>;
        const message = Object.values(errors)[0]?.[0] ?? null;
        const errorMessage =
          "One or more validation errors occurred." +
           "\n- " + message;
        return err(ServiceError.badRequest(errorMessage, errors));
      }
      if (statusResult.value.errors && statusResult.value.status === Status.SubscriptionError) {
        const errors = statusResult.value.errors as Record<string, string[]>;
        // TODO: This only picks the first error message, improve it to show all errors.
        const message = Object.values(errors)[0]?.[0] ?? null;
        const errorMessage = "Access denied to resource." + "\n- " + message;
        return err(ServiceError.forbidden(errorMessage));
      }
    } while (statusResult.value.status !== Status.Completed);

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
      if (error instanceof ProblemDetailsError) {
        // TODO: This only picks the first error message, improve it to show all errors.
        const errors = error.result!.errors as Record<string, string[]>;
        const message = Object.values(errors)[0]?.[0] ?? null;
        const errorMessage = error.result!.title + "\n- " + message;
        if (error.statusCode === 400) {
          return err(ServiceError.badRequest(errorMessage, errors));
        }
        if (error.statusCode === 403) {
          return err(ServiceError.forbidden(errorMessage));
        }
      }
      const serviceError = handleServiceError(error);
      return err(serviceError);
    } finally {
      buildFileStream.close();
    }

    let statusResult;
    do {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      statusResult = await this.apiService.getSdkGenerationStatus(
        generationId,
        configDir,
        commandMetadata.shell,
        authKey
      );
      
      if (statusResult.isErr()) {
        return err(statusResult.error);
      }
      if (statusResult.value.status === Status.Failed) {
        return err(ServiceError.ServerError);
      }
      if (statusResult.value.errors && statusResult.value.status === Status.ValidationError) {
        const errors = statusResult.value.errors as Record<string, string[]>;
        const sdkMergeFailedLanguages = errors.sdkMergeFailed;
        if (sdkMergeFailedLanguages?.length) {
          const errorMessage =
            "SDK generation failed for these languages due to merge conflict." +
            "\n- " +
            sdkMergeFailedLanguages.join("\n- ");
          return err(ServiceError.badRequest(errorMessage, errors));
        }

        const messages = Object.values(errors).flat();
        const errorMessage =
          "One or more validation errors occurred." +
          (messages.length ? "\n- " + messages.join("\n- ") : "");
        return err(ServiceError.badRequest(errorMessage, errors));
      }
      if (statusResult.value.errors && statusResult.value.status === Status.SubscriptionError) {
        const errors = statusResult.value.errors as Record<string, string[]>;
        const message = Object.values(errors).flat()[0] ?? null;
        const errorMessage = "Access denied to resource." + "\n- " + message;
        return err(ServiceError.forbidden(errorMessage));
      }
    } while (statusResult.value.status !== Status.Completed);

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

  public async generateV2Sdk(
    buildPath: FilePath,
    language: Language,
    stability: StabilityLevelTag,
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
        stability
      );
      generationId = response.result.id;
    } catch (error) {
      if (error instanceof ProblemDetailsError) {
        // TODO: This only picks the first error message, improve it to show all errors.
        const errors = error.result!.errors as Record<string, string[]>;
        const message = Object.values(errors)[0]?.[0] ?? null;
        const errorMessage = error.result!.title + '\n- ' + message;
        if (error.statusCode === 400) {
          return err(ServiceError.badRequest(errorMessage, errors));
        }
        if (error.statusCode === 403) {
          return err(ServiceError.forbidden(errorMessage));
        }
      }
      const serviceError = handleServiceError(error);
      return err(serviceError);
    } finally {
      buildFileStream.close();
    }

    let statusResult;
    do {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      statusResult = await this.apiService.getV2SdkGenerationStatus(
        generationId,
        configDir,
        commandMetadata.shell,
        authKey
      );

      if (statusResult.isErr()) {
        return err(statusResult.error);
      }
      if (statusResult.value.status === Status.Failed) {
        return err(ServiceError.ServerError);
      }
      if (statusResult.value.errors && statusResult.value.status === Status.ValidationError) {
        const errors = statusResult.value.errors as Record<string, string[]>;
        const messages = Object.values(errors).flat();
        const errorMessage =
          'One or more validation errors occurred.' + (messages.length ? '\n- ' + messages.join('\n- ') : '');
        return err(ServiceError.badRequest(errorMessage, errors));
      }
      if (statusResult.value.errors && statusResult.value.status === Status.SubscriptionError) {
        const errors = statusResult.value.errors as Record<string, string[]>;
        const message = Object.values(errors).flat()[0] ?? null;
        const errorMessage = 'Access denied to resource.' + '\n- ' + message;
        return err(ServiceError.forbidden(errorMessage));
      }
    } while (statusResult.value.status !== Status.Completed);

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

  private createAuthorizationHeader = (authInfo: AuthInfo | null, overrideAuthKey: string | null): string => {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  };

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
}
