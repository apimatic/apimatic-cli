import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { PortalConfig } from './portal-config.js';

/** An OpenAPI document found in `src/spec/`, with the slug its section is mounted at. */
export interface PortalSpec {
  slug: string;
  file: FilePath;
}

/** A validated portal source directory, ready to be built. */
export interface PortalSource {
  config: PortalConfig;
  specs: PortalSpec[];
  contentDirectory: DirectoryPath | null;
  staticDirectory: DirectoryPath | null;
}

/**
 * Why a source directory cannot be built. Each variant maps to its own message, so the
 * user is told which file is wrong rather than that "the portal failed".
 */
export type PortalSourceProblem =
  | { kind: 'missingConfig'; migration: PortalMigration | null }
  | { kind: 'invalidConfig'; errors: string[] }
  | { kind: 'unreadableSpec'; fileName: FileName }
  | { kind: 'unsupportedSpec'; fileName: FileName; format: string }
  | { kind: 'noSpecs' };

/**
 * What a pre-2.0 `APIMATIC-BUILD.json` can contribute to a `portal.json`, so the user is
 * shown a starting point and told exactly which settings have no equivalent yet.
 */
export interface PortalMigration {
  suggestedConfig: PortalConfig;
  unsupportedFields: string[];
}
