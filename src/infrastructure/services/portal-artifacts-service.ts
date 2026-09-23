import { err, ok, Result } from 'neverthrow';
import { CodeSampleCatalog, CodeSamples } from '../../types/portal/code-samples.js';
import { ServiceError } from '../service-error.js';
import { MOCK_CODE_SAMPLES } from './mock-code-samples.js';

export class PortalArtifactsService {
  public async generate(): Promise<Result<CodeSamples, ServiceError>> {
    const catalogs = MOCK_CODE_SAMPLES.map(([language, json]) => CodeSampleCatalog.fromJson(language, json));
    return catalogs.every((catalog) => catalog !== undefined)
      ? ok(new CodeSamples(catalogs))
      : err(ServiceError.InvalidResponse);
  }
}
