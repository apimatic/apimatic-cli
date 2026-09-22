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
  shadowedFiles: FileName[];
  /**
   * Pages below `content/api/<slug>/` for a specification `<slug>`. The section's generated
   * metadata lists only the reference pages, so these never appear in the sidebar.
   */
  hiddenPages: FilePath[];
  /**
   * Files in the content tree that look like navigation but are not read: a leftover Fumadocs
   * `meta` file in any format, or a `nav` file in a format or case the build's glob does not
   * match. Reported rather than left to sit there doing nothing.
   */
  ignoredNavigationFiles: FilePath[];
}

/** Why a source directory cannot be built; each variant maps to its own message. */
export type PortalSourceProblem =
  | { kind: 'missingConfig'; migration: PortalMigration | null }
  | { kind: 'invalidConfig'; errors: string[] }
  | { kind: 'invalidNavigation'; errors: string[] }
  | { kind: 'unreadableContent' }
  | { kind: 'unreadableSpec'; fileName: FileName }
  | { kind: 'unsupportedSpec'; fileName: FileName; format: string }
  | { kind: 'noSpecs' }
  | { kind: 'missingLogo'; logoPath: string };

/** What a pre-2.0 `APIMATIC-BUILD.json` can contribute towards a `portal.json`. */
export interface PortalMigration {
  suggestedConfig: PortalConfig;
  unsupportedFields: string[];
  /**
   * A `logoUrl` that cannot be carried over as it stands, because `logo` addresses the
   * `static/` directory. Kept so the user is told what to do with the image instead.
   */
  unmigratableLogo: string | null;
}
