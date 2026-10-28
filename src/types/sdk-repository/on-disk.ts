import { err, ok, Result } from 'neverthrow';
import { errorMessage } from '../../utils/error-utils.js';
import { GitProblem } from '../git/git-problem.js';
import { SdkRepositoryProblem } from '../sdk/repository-state.js';

export const gitFailed = (problem: GitProblem): SdkRepositoryProblem => ({ kind: 'gitFailed', reason: problem.reason });

export const fileFailed = (error: unknown): SdkRepositoryProblem => ({
  kind: 'fileFailed',
  reason: errorMessage(error)
});

/** A file operation as a `Result`, so a failing one answers with the file system's own words. */
export const onDisk = async <T>(work: Promise<T>): Promise<Result<T, SdkRepositoryProblem>> => {
  try {
    return ok(await work);
  } catch (error) {
    return err(fileFailed(error));
  }
};
