import fsExtra from "fs-extra";
import fs from "fs";
import * as path from "path";
import {
  ContentType,
  DocsPortalManagementController,
  Client,
  UnauthorizedResponseError,
  ProblemDetailsError,
  FileWrapper,
  ApiResponse,
  ApiError,
  TransformationController,
  Transformation,
  ExportFormats,
  InternalServerErrorResponseError
} from "@apimatic/sdk";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { GeneratePortalParams, ErrorResponse } from "../../types/portal/generate.js";
import { Result } from "../../types/common/result.js";
import { getMessageInRedColor, parseStreamBodyToJson, extractZipFile, deleteFile } from "../../utils/utils.js";
import { TransformationData } from "../../types/api/transform.js";
import { Sdl } from "../../types/sdl/sdl.js";

export class PortalService {
  private readonly CONTENT_TYPE = ContentType.EnumMultipartformdata;
  private readonly TIMEOUT = 0;

  async generateOnPremPortal(
    params: GeneratePortalParams,
    configDir: string
  ): Promise<Result<NodeJS.ReadableStream, string>> {
    if (!(await fsExtra.pathExists(params.sourceBuildInputZipFilePath))) {
      return Result.failure("Build file doesn't exist");
    }

    const authInfo: AuthInfo | null = await getAuthInfo(configDir);
    if (authInfo === null && !params.overrideAuthKey) {
      return Result.failure("You are not logged in, please login using `apimatic auth:login` or provide an auth key.");
    }

    const authorizationHeader = this.createAuthorizationHeader(authInfo, params.overrideAuthKey);
    const client = this.createApiClient(authorizationHeader);
    const docsPortalManagementController = new DocsPortalManagementController(client);

    try {
      const stream = await this.generatePortalFromSyncEndpoint(
        docsPortalManagementController,
        params.sourceBuildInputZipFilePath
      );
      return Result.success(stream);
    } catch (error) {
      return Result.failure(await this.handlePortalGenerationErrors(error, params));
    }
  }

  async generateSdl(specPath: string, configDir: string): Promise<Result<Sdl, string>> {
    if (!(await fsExtra.pathExists(specPath))) {
      return Result.failure("Spec file doesn't exist");
    }

    const authInfo: AuthInfo | null = await getAuthInfo(configDir);
    const authorizationHeader = this.createAuthorizationHeader(authInfo, null);
    const client = this.createApiClient(authorizationHeader);
    const transformationController = new TransformationController(client);

    try {
      const file = new FileWrapper(fs.createReadStream(specPath));
      const generation: ApiResponse<Transformation> = await transformationController.transformViaFile(
        ContentType.EnumMultipartformdata,
        file,
        ExportFormats.Apimatic
      );

      if (!generation.result.success) {
        return this.createGenericErrorResult();
      }

      const transformationId = generation.result.id;
      const { result }: TransformationData = await transformationController.downloadTransformedFile(transformationId);
      if ((result as NodeJS.ReadableStream).readable) {
        return Result.success((await parseStreamBodyToJson(result as NodeJS.ReadableStream)) as Sdl);
      } else {
        return this.createGenericErrorResult();
      }
    } catch {
      return this.createGenericErrorResult();
    }
  }

  private createGenericErrorResult() {
    return Result.failure<Sdl, string>("An unexpected error occurred");
  }

  private createAuthorizationHeader = (authInfo: AuthInfo | null, overrideAuthKey: string | null): string => {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  };

  private createApiClient = (authorizationHeader: string): Client => {
    return new Client({
      customHeaderAuthenticationCredentials: {
        Authorization: authorizationHeader
      },
      timeout: this.TIMEOUT
    });
  };

  private generatePortalFromSyncEndpoint = async (
    docsPortalManagementController: DocsPortalManagementController,
    zippedBuildFilePath: string
  ): Promise<NodeJS.ReadableStream> => {
    const file = new FileWrapper(fs.createReadStream(zippedBuildFilePath));
    const response: ApiResponse<NodeJS.ReadableStream | Blob> =
      await docsPortalManagementController.generateOnPremPortalViaBuildInput(this.CONTENT_TYPE, file);

    return response.result as NodeJS.ReadableStream;
  };

  private handlePortalGenerationErrors = async (error: unknown, params: GeneratePortalParams): Promise<string> => {
    if (error instanceof UnauthorizedResponseError) {
      //401
      const body = await this.parseErrorResponse(error);
      return getMessageInRedColor(body.message ?? "Unauthorized access.");
    } else if (error instanceof ProblemDetailsError) {
      //400 & 403
      const body = await this.parseErrorResponse(error);
      const message = body.errors[Object.keys(body.errors)[0]][0];
      return getMessageInRedColor(body.title + "\n- " + message);
    } else if (error instanceof ApiError && error.statusCode === 422) {
      //422
      return await this.saveAndExtractErrorZipFile(error, params);
    } else if (error instanceof InternalServerErrorResponseError) {
      //500
      const body = await this.parseErrorResponse(error);
      return getMessageInRedColor(
        `${body.message} Please try again or reach out to our team at support@apimatic.io for help if your problem persists.`
      );
    } else {
      return getMessageInRedColor(error instanceof Error ? error.message : String(error));
    }
  };

  private parseErrorResponse = async (error: unknown): Promise<ErrorResponse> => {
    if (error instanceof Error && "body" in error) {
      const stream = (error as { body: NodeJS.ReadableStream }).body;
      return await parseStreamBodyToJson(stream);
    }
    throw error;
  };

  private saveAndExtractErrorZipFile = async (error: ApiError, params: GeneratePortalParams): Promise<string> => {
    const data = error.body as NodeJS.ReadableStream;
    const writeStream = fs.createWriteStream(params.generatedPortalArtifactsZipFilePath);

    //TODO: Extract zip to temp folder and only copy the the debug report.
    return await new Promise<string>((resolve, reject) => {
      data
        .pipe(writeStream)
        .on("finish", async () => {
          await extractZipFile(params.generatedPortalArtifactsZipFilePath, params.generatedPortalArtifactsFolderPath);
          await deleteFile(params.generatedPortalArtifactsZipFilePath);
          await deleteFile(path.join(params.generatedPortalArtifactsFolderPath, "static"));
          resolve(
            getMessageInRedColor(
              "An error occurred during portal generation due to an issue with the input. An error report has been written at the destination path: " +
                path.join(params.generatedPortalArtifactsFolderPath, "apimatic-debug")
            )
          );
        })
        .on("error", async () => {
          reject(
            getMessageInRedColor(
              "An error occurred during portal generation due to an issue with the input. The error report could not be generated. Please try again later."
            )
          );
        });
    });
  };
}
