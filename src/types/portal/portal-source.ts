import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { OpenApiDocument } from './openapi-document.js';
import { PortalConfig } from './portal-config.js';

/** An OpenAPI document found in `src/spec/`, with the slug its section is mounted at. */
export interface PortalSpec {
  slug: string;
  file: FilePath;
  document: OpenApiDocument;
}

/** A validated portal source directory, ready to be built. */
export interface PortalSource {
  config: PortalConfig;
  specs: PortalSpec[];
  specDirectory: DirectoryPath;
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

/** Why a source directory cannot be built; each variant maps to its own message. */
export type PortalSourceProblem =
  | { kind: 'missingConfig' }
  | { kind: 'invalidConfig'; errors: string[] }
  | { kind: 'invalidNavigation'; errors: string[] }
  | { kind: 'unreadableContent' }
  | { kind: 'unreadableSpec'; fileName: FileName }
  | { kind: 'unsupportedSpec'; fileName: FileName; format: string }
  | { kind: 'noSpecs' }
  | { kind: 'missingLogo'; logoPath: string };
