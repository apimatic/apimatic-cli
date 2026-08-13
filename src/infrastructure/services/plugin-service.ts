import axios from 'axios';
import FormData from 'form-data';
import { err, ok, Result } from 'neverthrow';
import { AuthInfo, getAuthInfo } from '../../client-utils/auth-manager.js';
import { REQUEST_TIMEOUT_MS } from '../../config/axios-config.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import {
  PluginGenerationInitiatedResponse,
  PluginGenerationStatus,
  PluginGenerationStatusResponse
} from '../../types/plugin/generation-status.js';
import { discardStreamBody } from '../../utils/utils.js';
import { envInfo } from '../env-info.js';
import {
  GENERATION_TIMEOUT_MS,
  pollUntilCompleted,
  STATUS_POLL_INTERVAL_MS
} from '../generation-status-poller.js';
import { FileService } from '../file-service.js';
import { mapRequestError, mapTransportError, ServiceError } from '../service-error.js';

const TIMING_DEFAULTS = {
  pollIntervalMs: STATUS_POLL_INTERVAL_MS,
  generationTimeoutMs: GENERATION_TIMEOUT_MS,
  requestTimeoutMs: REQUEST_TIMEOUT_MS
};

/** Overridable so tests are not paced by the production defaults; nothing else overrides them. */
export type GenerationTimings = Partial<typeof TIMING_DEFAULTS>;

export class PluginService {
  private readonly apiBaseUrl = 'https://api.apimatic.io' as const;
  private readonly fileService = new FileService();
  private readonly timings: typeof TIMING_DEFAULTS;

  constructor(timings: GenerationTimings = {}) {
    this.timings = { ...TIMING_DEFAULTS, ...timings };
  }

  public async generatePlugin(
    buildPath: FilePath,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null
  ): Promise<Result<NodeJS.ReadableStream, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    // `auth logout` blanks config.json rather than deleting it, so a logged-out user
    // still has a non-null AuthInfo with an empty key — check the key, not the object.
    const token = authKey || authInfo?.authKey;
    if (!token) {
      return err(ServiceError.unauthorizedWithHint(null));
    }

    const initiated = await this.initiateGeneration(buildPath, commandMetadata, token);
    if (initiated.isErr()) {
      return err(initiated.error);
    }

    const generationId = initiated.value.id;
    const completed = await pollUntilCompleted({
      pollIntervalMs: this.timings.pollIntervalMs,
      fetchStatus: () => this.getGenerationStatus(generationId, commandMetadata.shell, token),
      timeout: { budgetMs: this.timings.generationTimeoutMs, label: 'Plugin generation' }
    });
    if (completed.isErr()) {
      return err(completed.error);
    }

    return await this.downloadPlugin(generationId, commandMetadata.shell, token);
  }

  private async initiateGeneration(
    buildPath: FilePath,
    commandMetadata: CommandMetadata,
    token: string
  ): Promise<Result<PluginGenerationInitiatedResponse, ServiceError>> {
    const buildFileStream = await this.fileService.getStream(buildPath);

    try {
      const formData = new FormData();
      formData.append('file', buildFileStream);

      const response = await this.axiosInstance(commandMetadata.shell, token).post('/plugin', formData, {
        headers: formData.getHeaders(),
        params: { origin: `APIMATIC CLI ${commandMetadata.commandName}` },
        responseType: 'json'
      });

      const id = (response.data as PluginGenerationInitiatedResponse | undefined)?.id;
      return id ? ok({ id }) : err(ServiceError.InvalidResponse);
    } catch (error) {
      return err(mapRequestError(error));
    } finally {
      buildFileStream.close();
    }
  }

  private async getGenerationStatus(
    generationId: string,
    shell: string,
    token: string
  ): Promise<Result<PluginGenerationStatusResponse, ServiceError>> {
    try {
      const response = await this.axiosInstance(shell, token).get(`/plugin/${generationId}/status`, {
        headers: { Accept: 'application/json' },
        maxRedirects: 0,
        validateStatus: () => true
      });

      if (response.status === 200) {
        return ok(response.data as PluginGenerationStatusResponse);
      }

      // Once generation finishes, the API redirects to the download location.
      if (response.status === 302) {
        return ok({ status: PluginGenerationStatus.Completed });
      }

      // `validateStatus` above stops axios throwing, so nothing reaches the catch block.
      if (response.status === 401) {
        return err(ServiceError.unauthorizedWithHint(null));
      }
      if (response.status === 404) {
        return err(ServiceError.NotFound);
      }
      if (response.status === 500) {
        return err(ServiceError.ServerError);
      }

      return err(ServiceError.InvalidResponse);
    } catch (error) {
      return err(mapRequestError(error));
    }
  }

  private async downloadPlugin(
    generationId: string,
    shell: string,
    token: string
  ): Promise<Result<NodeJS.ReadableStream, ServiceError>> {
    try {
      const response = await this.axiosInstance(shell, token).get(`/plugin/${generationId}/download`, {
        responseType: 'stream'
      });
      return ok(response.data as NodeJS.ReadableStream);
    } catch (error) {
      // The body of a failed streamed response is itself a stream; leaving it open hangs the CLI.
      // Discarding it also rules out reading ProblemDetails here, so only the status code maps.
      if (axios.isAxiosError(error)) {
        discardStreamBody(error.response?.data);
      }
      return err(mapTransportError(error));
    }
  }

  private axiosInstance(shell: string, apiKey: string) {
    return axios.create({
      baseURL: envInfo.getBaseUrl() ?? this.apiBaseUrl,
      timeout: this.timings.requestTimeoutMs,
      headers: {
        'User-Agent': envInfo.getUserAgent(shell),
        Authorization: `X-Auth-Key ${apiKey}`
      }
    });
  }
}

