import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { SuggestedSite } from './config/site-config.js';
import { PortalConfig } from './portal-config.js';

/** An OpenAPI document found in `src/spec/`, with the slug its section is mounted at. */
export interface PortalSpec {
  slug: string;
  file: FilePath;
}

/** A validated portal source directory, ready to be built. */
export interface PortalSource {
  config: PortalConfig;
  /**
   * What the only specification says about itself, which the config's name and description
   * default to, or null with several. Kept so `portal serve` can judge an edited config by the
   * same rules without reading the specifications again.
   */
  suggestedSite: SuggestedSite | null;
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
   * A `nav.json` written in a case the build's glob does not match, such as `Nav.json`, and
   * so read by nothing. Reported rather than left to sit there doing nothing.
   */
  ignoredNavigationFiles: FilePath[];
}

/** Why a source directory could not be written; each variant maps to its own message. */
export type PortalScaffoldProblem =
  | { kind: 'configUnreadable' }
  | { kind: 'configUnwritable' }
  // `reason` is the message of whatever the file service raised, which nothing here can narrow.
  | { kind: 'sourceUnwritable'; reason: string };

/** Why a source directory cannot be built; each variant maps to its own message. */
export type PortalSourceProblem =
  | { kind: 'missingConfig' }
  // `missingPortal`: the block itself is absent, which is what quickstart sets up.
  | { kind: 'invalidConfig'; errors: string[]; missingPortal: boolean }
  | { kind: 'invalidNavigation'; errors: string[] }
  | { kind: 'unreadableContent' }
  | { kind: 'unreadableSpec'; fileName: FileName }
  | { kind: 'unsupportedSpec'; fileName: FileName; format: string }
  | { kind: 'noSpecs' }
  // Every file the block names that is not on disk, each with the setting that names it.
  | { kind: 'missingStaticFiles'; files: { setting: string; path: string }[] };
