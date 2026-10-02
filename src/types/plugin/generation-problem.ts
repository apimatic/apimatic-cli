import { ServiceError } from '../../infrastructure/service-error.js';
import { FileProblem } from '../file/file-problem.js';
import { PluginConfigWriteFailure } from '../plugin-config-context.js';

export type PluginGenerationProblem =
  | FileProblem
  | { kind: 'configNotPrepared'; failure: PluginConfigWriteFailure }
  | { kind: 'generationFailed'; error: ServiceError };
