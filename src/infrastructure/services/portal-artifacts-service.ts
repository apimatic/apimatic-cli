import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { CodeSampleCatalog, CodeSamples } from '../../types/portal/code-samples.js';
import { Language } from '../../types/sdk/generate.js';
import { FilePath } from '../../types/file/filePath.js';
import { FileService } from '../file-service.js';
import { ServiceError } from '../service-error.js';

export class PortalArtifactsService {
  private readonly fileService = new FileService();

  // Stands in for a call to `/api/portal-artifacts` until that endpoint exists.
  public async generate(): Promise<Result<CodeSamples, ServiceError>> {
    const samplesPath = process.env.APIMATIC_CODE_SAMPLES_PATH;
    if (!samplesPath) {
      return ok(new CodeSamples([]));
    }

    const samplesFile = FilePath.create(path.resolve(samplesPath));
    if (!samplesFile || !(await this.fileService.fileExists(samplesFile))) {
      return err(ServiceError.NotFound);
    }

    let json: unknown;
    try {
      json = JSON.parse(await this.fileService.getContents(samplesFile));
    } catch {
      return err(ServiceError.InvalidResponse);
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return err(ServiceError.InvalidResponse);
    }

    const languages = Object.values(Language) as string[];
    const catalogs = Object.entries(json).map(([language, catalog]) =>
      languages.includes(language) ? CodeSampleCatalog.fromJson(language as Language, catalog) : undefined
    );
    return catalogs.every((catalog) => catalog !== undefined)
      ? ok(new CodeSamples(catalogs))
      : err(ServiceError.InvalidResponse);
  }
}
