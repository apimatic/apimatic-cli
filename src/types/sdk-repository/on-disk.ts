import { err, ok, Result } from 'neverthrow';
import { errorMessage } from '../../utils/error-utils.js';
import { RepositoryProblem } from '../sdk/repository-state.js';

export const fileFailed = (error: unknown): RepositoryProblem => ({ reason: errorMessage(error) });

/** A file operation as a `Result`, so a failing one answers with the file system's own words. */
export const onDisk = async <T>(work: Promise<T>): Promise<Result<T, RepositoryProblem>> => {
  try {
    return ok(await work);
  } catch (error) {
    return err(fileFailed(error));
  }
};
