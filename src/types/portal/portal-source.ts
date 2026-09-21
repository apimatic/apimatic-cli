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
  /** Spec slugs that a page under `content/api/` also claims, so the two share an address. */
  collidingSlugs: string[];
  /**
   * Files in the content tree that look like navigation but are not read, relative to
   * `src/`: a leftover `meta.json`, or a case variant the build's glob does not match.
   * Reported rather than left to sit there doing nothing.
   */
  ignoredNavigationFiles: string[];
}

/** Why a source directory cannot be built; each variant maps to its own message. */
export type PortalSourceProblem =
  | { kind: 'missingConfig'; migration: PortalMigration | null }
  | { kind: 'invalidConfig'; errors: string[] }
  | { kind: 'invalidNavigation'; errors: string[] }
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
  /**
   * Whether the pre-2.0 file described its navigation with a table of contents. Reported
   * separately because that has a 2.0 equivalent: the `nav.json` files beside the pages.
   */
  hadTableOfContents: boolean;
}
