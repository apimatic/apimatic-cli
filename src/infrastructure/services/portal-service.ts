import * as fsExtra from "fs-extra";
import * as fs from "fs";
import { FileWrapper, ApiResponse, ApiError } from "@apimatic/sdk";
import {
  ContentType,
  DocsPortalManagementController,
  Client,
  UnauthorizedResponseError,
  ProblemDetailsError
} from "@apimatic/sdk";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager";
import { GeneratePortalParams, ErrorResponse } from "../../types/portal/generate";
import { Result } from "../../types/common/result";
import { getMessageInRedColor, parseStreamBodyToJson, extractZipFile, deleteFile } from "../../utils/utils";

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
      return getMessageInRedColor(body.message ?? "Unauthorized access");
    } else if (error instanceof ProblemDetailsError) {
      //400 & 403
      const body = await this.parseErrorResponse(error);
      const message = body.errors[Object.keys(body.errors)[0]][0];
      return getMessageInRedColor(body.title + "\n- " + message);
    } else if (error instanceof ApiError && error.statusCode === 422) {
      //422
      await this.extractErrorZipFile(error, params);
      return getMessageInRedColor(
        "An error occurred during portal generation due to an issue with the input. An error report has been written at the destination path: " +
          params.generatedPortalArtifactsFolderPath
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

  private extractErrorZipFile = async (error: ApiError, params: GeneratePortalParams): Promise<void> => {
    const data = error.body as NodeJS.ReadableStream;
    const writeStream = fs.createWriteStream(params.generatedPortalArtifactsZipFilePath);

    await new Promise<void>((resolve, reject) => {
      data
        .pipe(writeStream)
        .on("finish", () => resolve())
        .on("error", reject);
    });

    if (!params.generateZipFile) {
      await extractZipFile(params.generatedPortalArtifactsZipFilePath, params.generatedPortalArtifactsFolderPath);
      await deleteFile(params.generatedPortalArtifactsZipFilePath);
    }
  };
}
