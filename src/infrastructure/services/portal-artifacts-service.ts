import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { CodeSampleCatalog, CodeSamples } from '../../types/portal/code-samples.js';
import { Language } from '../../types/sdk/generate.js';
import { FilePath } from '../../types/file/filePath.js';
import { format as f } from '../../prompts/format.js';
import { FileService } from '../file-service.js';
import { ServiceError } from '../service-error.js';

const SAMPLES_PATH_VARIABLE = 'APIMATIC_CODE_SAMPLES_PATH';

export class PortalArtifactsService {
  private readonly fileService = new FileService();

  // Stands in for a call to `/api/portal-artifacts` until that endpoint exists.
  public async generate(): Promise<Result<CodeSamples, ServiceError>> {
    const samplesPath = process.env[SAMPLES_PATH_VARIABLE];
    if (!samplesPath) {
      return ok(new CodeSamples([]));
    }

    const resolved = path.resolve(samplesPath);
    const samplesFile = FilePath.create(resolved);
    if (!samplesFile || !(await this.fileService.fileExists(samplesFile))) {
      return err(ServiceError.notFound(`${describe(resolved)} does not exist.`));
    }

    let json: unknown;
    try {
      json = JSON.parse(await this.fileService.getContents(samplesFile));
    } catch {
      return err(ServiceError.invalidResponse(`${describe(resolved)} is not valid JSON.`));
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return err(ServiceError.invalidResponse(`${describe(resolved)} must hold an object keyed by language.`));
    }

    const languages = Object.values(Language) as string[];
    const parsed = Object.entries(json)
      .filter(([language]) => languages.includes(language))
      .map(([language, catalog]) => ({ language, catalog: CodeSampleCatalog.fromJson(language as Language, catalog) }));
    const malformed = parsed.filter(({ catalog }) => catalog === undefined).map(({ language }) => language);
    return malformed.length === 0
      ? ok(new CodeSamples(parsed.flatMap(({ catalog }) => catalog ?? [])))
      : err(ServiceError.invalidResponse(`${describe(resolved)} has a malformed catalog for ${malformed.join(', ')}.`));
  }
}

function describe(samplesPath: string): string {
  return `The code samples file ${f.var(samplesPath)} named by ${f.var(SAMPLES_PATH_VARIABLE)}`;
}
