import axios from 'axios';
import FormData from 'form-data';
import { err, ok, Result } from 'neverthrow';
import { AuthInfo, getAuthInfo } from '../../client-utils/auth-manager.js';
import { REQUEST_TIMEOUT_MS } from '../../config/axios-config.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { CodeSampleCatalog, CodeSampleCatalogs } from '../../types/portal/code-samples.js';
import {
  PortalArtifactsGenerationStatus,
  PortalArtifactsInitiatedResponse,
  PortalArtifactsStatusResponse
} from '../../types/portal/generation-status.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { Language } from '../../types/sdk/generate.js';
import { discardStreamBody } from '../../utils/utils.js';
import { envInfo } from '../env-info.js';
import { FileService } from '../file-service.js';
import {
  GENERATION_TIMEOUT_MS,
  pollUntilCompleted,
  STATUS_POLL_INTERVAL_MS,
  ValidationErrorFormatter
} from '../generation-status-poller.js';
import { mapRequestError, mapTransportError, ServiceError } from '../service-error.js';
import { ZipService } from '../zip-service.js';

const TIMING_DEFAULTS = {
  pollIntervalMs: STATUS_POLL_INTERVAL_MS,
  // The server gives a run 25 minutes and reports the overrun itself. This sits clear of that so
  // the message a user reads is the server's, which names what actually ran long.
  generationTimeoutMs: GENERATION_TIMEOUT_MS,
  requestTimeoutMs: REQUEST_TIMEOUT_MS
};

/** Overridable so tests are not paced by the production defaults; nothing else overrides them. */
export type GenerationTimings = Partial<typeof TIMING_DEFAULTS>;

/** The entries the portal artifacts zip is made of, as the endpoint lays them out. */
const ARTIFACTS_ZIP = {
  sdkDirectory: 'sdk',
  codeSamplesDirectory: 'code-samples',
  plugin: 'plugin.zip'
} as const;

export class PortalArtifactsService {
  private readonly apiBaseUrl = 'https://api.apimatic.io' as const;
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();
  private readonly timings: typeof TIMING_DEFAULTS;

  constructor(timings: GenerationTimings = {}) {
    this.timings = { ...TIMING_DEFAULTS, ...timings };
  }

  /**
   * One run of `/portal-artifacts`: the SDKs, the code-sample catalogs and the context plugin,
   * delivered as a single archive and unpacked into `into`.
   *
   * `buildDirectory` is the `src/` directory, which is zipped and uploaded as the build. What the run
   * produces is decided entirely by the `apimatic.json` inside it — the languages it names, and
   * whether it carries a `plugin` block.
   */
  public async generate(
    buildDirectory: DirectoryPath,
    into: DirectoryPath,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null
  ): Promise<Result<PortalArtifacts, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    // `auth logout` blanks config.json rather than deleting it, so a logged-out user still has a
    // non-null AuthInfo with an empty key — check the key, not the object.
    const token = authKey || authInfo?.authKey;
    if (!token) {
      return err(ServiceError.unauthorizedWithHint(null));
    }

    const build = new FilePath(into, new FileName('build.zip'));
    try {
      await this.zipService.archive(buildDirectory, build);
    } catch {
      return err(ServiceError.InvalidResponse);
    }

    const initiated = await this.initiateGeneration(build, commandMetadata, token);
    if (initiated.isErr()) {
      return err(initiated.error);
    }

    const generationId = initiated.value.id;
    const completed = await pollUntilCompleted({
      pollIntervalMs: this.timings.pollIntervalMs,
      fetchStatus: () => this.getGenerationStatus(generationId, commandMetadata.shell, token),
      timeout: { budgetMs: this.timings.generationTimeoutMs, label: 'Portal artifacts generation' },
      formatValidationError: formatPortalArtifactsError
    });
    if (completed.isErr()) {
      return err(completed.error);
    }

    const zip = await this.download(generationId, commandMetadata.shell, token);
    if (zip.isErr()) {
      return err(zip.error);
    }

    return await this.unpack(zip.value, into);
  }

  private async initiateGeneration(
    build: FilePath,
    commandMetadata: CommandMetadata,
    token: string
  ): Promise<Result<PortalArtifactsInitiatedResponse, ServiceError>> {
    const buildFileStream = await this.fileService.getStream(build);

    try {
      const formData = new FormData();
      formData.append('file', buildFileStream);

      const response = await this.axiosInstance(commandMetadata.shell, token).post('/portal-artifacts', formData, {
        headers: formData.getHeaders(),
        params: { origin: `APIMATIC CLI ${commandMetadata.commandName}` },
        responseType: 'json'
      });

      const id = (response.data as PortalArtifactsInitiatedResponse | undefined)?.id;
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
  ): Promise<Result<PortalArtifactsStatusResponse, ServiceError>> {
    try {
      const response = await this.axiosInstance(shell, token).get(`/portal-artifacts/${generationId}/status`, {
        headers: { Accept: 'application/json' },
        maxRedirects: 0,
        validateStatus: () => true
      });

      if (response.status === 200) {
        return ok(response.data as PortalArtifactsStatusResponse);
      }

      // The gateway answers a finished run with a redirect to the download, the same as it does
      // for plugin generation. The status body never says `Completed`; the 302 is what says it.
      if (response.status === 302) {
        return ok({ status: PortalArtifactsGenerationStatus.Completed });
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

  private async download(
    generationId: string,
    shell: string,
    token: string
  ): Promise<Result<NodeJS.ReadableStream, ServiceError>> {
    try {
      const response = await this.axiosInstance(shell, token).get(`/portal-artifacts/${generationId}/download`, {
        responseType: 'stream'
      });
      return ok(response.data as NodeJS.ReadableStream);
    } catch (error) {
      // The body of a failed streamed response is itself a stream; leaving it open hangs the CLI.
      if (axios.isAxiosError(error)) {
        discardStreamBody(error.response?.data);
      }
      return err(mapTransportError(error));
    }
  }

  /**
   * The archive holds `sdk/<language>.zip`, `code-samples/<language>.json` and, when the config
   * asked for one, `plugin.zip`. Everything is optional: a portal that declares no languages and
   * no plugin is a valid run that delivers an empty zip.
   */
  private async unpack(
    zip: NodeJS.ReadableStream,
    into: DirectoryPath
  ): Promise<Result<PortalArtifacts, ServiceError>> {
    const archive = new FilePath(into, new FileName('portal-artifacts.zip'));
    const contents = into.join('artifacts');

    try {
      await this.fileService.writeFile(archive, zip);
      await this.fileService.createDirectoryIfNotExists(contents);
      await this.zipService.unArchive(archive, contents);
    } catch {
      return err(ServiceError.InvalidResponse);
    }

    const codeSampleCatalogs = await this.readCodeSampleCatalogs(contents.join(ARTIFACTS_ZIP.codeSamplesDirectory));
    if (codeSampleCatalogs.isErr()) {
      return err(codeSampleCatalogs.error);
    }

    const plugin = new FilePath(contents, new FileName(ARTIFACTS_ZIP.plugin));

    return ok(
      new PortalArtifacts(
        codeSampleCatalogs.value,
        await this.readSdks(contents.join(ARTIFACTS_ZIP.sdkDirectory)),
        (await this.fileService.fileExists(plugin)) ? plugin : undefined
      )
    );
  }

  /**
   * Keyed by the delivered file's stem rather than parsed into `Language`, so a language the
   * server adds before this CLI models it is still placed rather than dropped.
   */
  private async readSdks(directory: DirectoryPath): Promise<ReadonlyMap<string, FilePath>> {
    if (!(await this.fileService.directoryExists(directory))) {
      return new Map();
    }

    const sdks = new Map<string, FilePath>();
    for (const fileName of await this.fileService.getFileNames(directory)) {
      const name = fileName.toString();
      if (name.endsWith('.zip')) {
        sdks.set(name.slice(0, -'.zip'.length), new FilePath(directory, fileName));
      }
    }
    return sdks;
  }

  /**
   * A catalog this CLI cannot read is an error rather than an omission: silently dropping one
   * would publish a portal missing the samples for a language the user asked for, and say nothing.
   */
  private async readCodeSampleCatalogs(directory: DirectoryPath): Promise<Result<CodeSampleCatalogs, ServiceError>> {
    if (!(await this.fileService.directoryExists(directory))) {
      return ok(new CodeSampleCatalogs([]));
    }

    const languages = Object.values(Language) as string[];
    const catalogs: CodeSampleCatalog[] = [];

    for (const fileName of await this.fileService.getFileNames(directory)) {
      const name = fileName.toString();
      if (!name.endsWith('.json')) {
        continue;
      }

      const language = name.slice(0, -'.json'.length);
      if (!languages.includes(language)) {
        return err(ServiceError.InvalidResponse);
      }

      let json: unknown;
      try {
        json = JSON.parse(await this.fileService.getContents(new FilePath(directory, fileName)));
      } catch {
        return err(ServiceError.InvalidResponse);
      }

      const catalog = CodeSampleCatalog.fromJson(language as Language, json);
      if (!catalog) {
        return err(ServiceError.InvalidResponse);
      }
      catalogs.push(catalog);
    }

    return ok(new CodeSampleCatalogs(catalogs));
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

/**
 * A run is all or nothing, and it reports every reason at once: one key per language that failed,
 * plus `plugin`. Listing them under their own names is the only way a user learns that two things
 * went wrong rather than one.
 */
const formatPortalArtifactsError: ValidationErrorFormatter = (errors) => {
  const entries = Object.entries(errors);
  if (entries.length === 0) {
    return 'Portal artifacts generation failed.';
  }

  const lines = entries.flatMap(([subject, messages]) => messages.map((message) => `${subject}: ${message}`));
  return 'Portal artifacts could not be generated.\n- ' + lines.join('\n- ');
};
