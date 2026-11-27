import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { Buffer } from 'node:buffer';
import { ReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { Status } from '@apimatic/sdk';
import { err, ok, Result } from 'neverthrow';
import { getAuthInfo } from '../../client-utils/auth-manager.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { envInfo } from '../env-info.js';
import { FileService } from '../file-service.js';
import {
  GenerationStatus,
  GenerationTimings,
  pollUntilCompleted,
  TIMING_DEFAULTS
} from '../generation-status-poller.js';
import { mapRequestError, mapTransportError, ServiceError } from '../service-error.js';

/** Where the download holds the stub files, from its root. With the three routes below it is all codegen's `/mock` contract fixes. */
export const STUB_FILES_IN_DOWNLOAD = '.';

export class StubGenerationService {
  private readonly apiBaseUrl = 'https://api.apimatic.io' as const;
  private readonly fileService = new FileService();
  private readonly timings: typeof TIMING_DEFAULTS;

  constructor(timings: GenerationTimings = {}) {
    this.timings = { ...TIMING_DEFAULTS, ...timings };
  }

  public async generateStubs(
    buildPath: FilePath,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null
  ): Promise<Result<NodeJS.ReadableStream, ServiceError>> {
    const authInfo = await getAuthInfo(configDir.toString());
    // `auth logout` blanks config.json rather than deleting it, so the key is what is checked.
    const token = authKey || authInfo?.authKey;
    if (!token) {
      return err(ServiceError.unauthorizedWithHint(null));
    }

    const api = axios.create({
      baseURL: envInfo.getBaseUrl() ?? this.apiBaseUrl,
      timeout: this.timings.requestTimeoutMs,
      headers: {
        'User-Agent': envInfo.getUserAgent(commandMetadata.shell),
        Authorization: `X-Auth-Key ${token}`
      }
    });

    const initiated = await StubGenerationService.initiateGeneration(
      api,
      await this.fileService.getStream(buildPath),
      commandMetadata.commandName
    );
    if (initiated.isErr()) {
      return err(initiated.error);
    }

    const generationId = initiated.value;
    const completed = await pollUntilCompleted({
      pollIntervalMs: this.timings.pollIntervalMs,
      fetchStatus: () => StubGenerationService.getStubGenerationStatus(api, generationId),
      timeout: { budgetMs: this.timings.generationTimeoutMs, label: 'Stub generation' }
    });
    if (completed.isErr()) {
      return err(completed.error);
    }

    return await StubGenerationService.downloadStubs(api, generationId);
  }

  private static async initiateGeneration(
    api: AxiosInstance,
    build: ReadStream,
    commandName: string
  ): Promise<Result<string, ServiceError>> {
    try {
      const formData = new FormData();
      formData.append('file', build);

      const response = await api.post('/mock', formData, {
        headers: formData.getHeaders(),
        params: { origin: `APIMATIC CLI ${commandName}` },
        responseType: 'json'
      });

      const id = (response.data as { id?: string } | undefined)?.id;
      return id ? ok(id) : err(ServiceError.InvalidResponse);
    } catch (error) {
      return err(mapRequestError(error));
    } finally {
      build.close();
    }
  }

  private static async getStubGenerationStatus(
    api: AxiosInstance,
    generationId: string
  ): Promise<Result<GenerationStatus, ServiceError>> {
    try {
      const response = await api.get(`/mock/${generationId}/status`, {
        headers: { Accept: 'application/json' },
        maxRedirects: 0,
        validateStatus: () => true
      });

      if (response.status === 200) {
        return ok(response.data as GenerationStatus);
      }
      // A finished run is a redirect to the download, which a followed redirect would hand back as a status body.
      if (response.status === 302) {
        return ok({ status: Status.Completed });
      }
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

  private static async downloadStubs(
    api: AxiosInstance,
    generationId: string
  ): Promise<Result<NodeJS.ReadableStream, ServiceError>> {
    try {
      // Received whole, so a connection that drops part-way fails here and not while the caller saves a stream.
      const response = await api.get<ArrayBuffer>(`/mock/${generationId}/download`, { responseType: 'arraybuffer' });
      return ok(Readable.from([Buffer.from(response.data)]));
    } catch (error) {
      return err(mapTransportError(error));
    }
  }
}
