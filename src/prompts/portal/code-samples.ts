import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { FileName } from '../../types/file/fileName.js';
import { CodeSamples } from '../../types/portal/code-samples.js';
import { format as f } from '../format.js';
import { withSpinner } from '../prompt.js';

export function generateCodeSamples(fn: Promise<Result<CodeSamples, ServiceError>>) {
  return withSpinner('Generating code samples', 'Code samples ready.', (error) => error.errorMessage, fn, {
    indicator: 'timer'
  });
}

export function reportUnsampledSpecs(fileNames: FileName[]): void {
  if (fileNames.length === 0) {
    return;
  }
  const names = fileNames.map((fileName) => f.var(fileName.toString())).join(', ');
  log.warn(`Code samples are left off the reference pages of ${names}, since their $refs reach outside ${f.var('spec')}.`);
}

export function reportUnplacedSamples(endpoints: string[]): void {
  if (endpoints.length === 0) {
    return;
  }
  log.warn(`No operation in ${f.var('spec')} takes the code samples for ${endpoints.join(', ')}.`);
}
