import { ServiceError } from '../../infrastructure/service-error.js';
import { FileProblem } from '../file/file-problem.js';
import { PluginConfigWriteFailure } from '../plugin-config-context.js';

export type PluginBuildProblem = FileProblem | { kind: 'configNotPrepared'; failure: PluginConfigWriteFailure };

export type PluginGenerationProblem = PluginBuildProblem | { kind: 'generationFailed'; error: ServiceError };
