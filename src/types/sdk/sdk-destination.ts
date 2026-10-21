import { CommitId } from '../git/commit-id.js';
import { SdkRepositoryContext } from '../sdk-repository-context.js';

/**
 * How a run will write the SDK directory, decided before anything is uploaded: replaced as
 * today, when nothing can be kept; replaced and then recorded, so the next run has a base; or
 * merged over the developer's changes against the base the generation record names. `remote`
 * is where the snapshot is shared afterwards, none when the repository has no remote.
 */
export type SdkDestination =
  | { kind: 'overwrite' }
  | { kind: 'record'; repository: SdkRepositoryContext | undefined; remote: string | undefined }
  | { kind: 'merge'; repository: SdkRepositoryContext; base: CommitId; remote: string | undefined };
