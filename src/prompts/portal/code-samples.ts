import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import {
  CodeSamplesFileFailure,
  GeneratedCodeSamples,
  SAMPLES_PATH_VARIABLE
} from '../../infrastructure/services/portal-artifacts-service.js';
import { format as f } from '../format.js';
import { withSpinner } from '../prompt.js';

export function generateCodeSamples(fn: Promise<Result<GeneratedCodeSamples, CodeSamplesFileFailure>>) {
  return withSpinner('Generating code samples', 'Code samples ready.', describeFailure, fn, { indicator: 'timer' });
}

export function reportIgnoredSampleKeys(keys: string[]): void {
  if (keys.length === 0) {
    return;
  }
  log.warn(`Skipped ${keys.map((key) => f.var(key)).join(', ')} in the code samples file: not a language.`);
}

export function reportUnplacedSamples(endpoints: string[]): void {
  if (endpoints.length === 0) {
    return;
  }
  log.warn(`No operation in ${f.var('spec')} takes the code samples for ${endpoints.join(', ')}.`);
}

function describeFailure({ file, problem }: CodeSamplesFileFailure): string {
  const subject = `The code samples file ${f.var(file)} named by ${f.var(SAMPLES_PATH_VARIABLE)}`;
  switch (problem.kind) {
    case 'missing':
      return `${subject} does not exist.`;
    case 'invalidJson':
      return `${subject} is not valid JSON.`;
    case 'notKeyedByLanguage':
      return `${subject} must hold an object keyed by language.`;
    case 'malformedCatalogs':
      return `${subject} has a malformed catalog for ${problem.languages.join(', ')}.`;
  }
}
