import { CommitId } from './commit-id.js';
import { SdkRepository } from './sdk-repository.js';

/**
 * How a run will write the SDK directory, decided before anything is uploaded: replaced as
 * today, when nothing can be kept; replaced and then recorded, so the next run has a base; or
 * merged over the developer's changes against the base the generation record names.
 */
export type SdkDestination =
  | { kind: 'overwrite'; zip: boolean }
  | { kind: 'record'; repository: SdkRepository | undefined }
  | { kind: 'merge'; repository: SdkRepository; base: CommitId };
