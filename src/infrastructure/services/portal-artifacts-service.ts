import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { CodeSampleCatalog, CodeSamples } from '../../types/portal/code-samples.js';
import { Language } from '../../types/sdk/generate.js';
import { FilePath } from '../../types/file/filePath.js';
import { isJsonObject } from '../../types/common/json-object.js';
import { FileService } from '../file-service.js';

export const SAMPLES_PATH_VARIABLE = 'APIMATIC_CODE_SAMPLES_PATH';

export type CodeSamplesFileProblem =
  | { kind: 'missing' }
  | { kind: 'invalidJson' }
  | { kind: 'notKeyedByLanguage' }
  | { kind: 'malformedCatalogs'; languages: string[] };

export interface CodeSamplesFileFailure {
  file: string;
  problem: CodeSamplesFileProblem;
}

export interface GeneratedCodeSamples {
  samples: CodeSamples;
  ignoredKeys: string[];
}

export class PortalArtifactsService {
  private readonly fileService = new FileService();

  // Stands in for a call to `/api/portal-artifacts` until that endpoint exists.
  public async generate(): Promise<Result<GeneratedCodeSamples, CodeSamplesFileFailure>> {
    const samplesPath = process.env[SAMPLES_PATH_VARIABLE];
    if (!samplesPath) {
      return ok({ samples: new CodeSamples([]), ignoredKeys: [] });
    }

    const file = path.resolve(samplesPath);
    const fail = (problem: CodeSamplesFileProblem) => err({ file, problem });
    const samplesFile = FilePath.create(file);
    if (!samplesFile || !(await this.fileService.fileExists(samplesFile))) {
      return fail({ kind: 'missing' });
    }

    let json: unknown;
    try {
      json = JSON.parse(await this.fileService.getContents(samplesFile));
    } catch {
      return fail({ kind: 'invalidJson' });
    }
    if (!isJsonObject(json)) {
      return fail({ kind: 'notKeyedByLanguage' });
    }

    const languages = Object.values(Language) as string[];
    const keys = Object.keys(json);
    const parsed = Object.entries(json)
      .filter(([key]) => languages.includes(key))
      .map(([language, catalog]) => ({ language, catalog: CodeSampleCatalog.fromJson(language as Language, catalog) }));
    const malformed = parsed.filter(({ catalog }) => catalog === undefined).map(({ language }) => language);
    if (malformed.length > 0) {
      return fail({ kind: 'malformedCatalogs', languages: malformed });
    }
    return ok({
      samples: new CodeSamples(parsed.flatMap(({ catalog }) => catalog ?? [])),
      ignoredKeys: keys.filter((key) => !languages.includes(key))
    });
  }
}
