import { DirectoryPath } from '../file/directoryPath.js';
import { FilePath } from '../file/filePath.js';
import { SharedTabName } from './portal-tabs.js';

/** What a build accepts in `content/`, but the user should hear of. */
export interface ContentNotices {
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
  /** The folders `content/nav.json` makes tabs of, in its order; listing one is all it takes. */
  folderTabs: DirectoryPath[];
  /** Names more than one tab would show, which the build accepts and a reader cannot tell apart. */
  sharedTabNames: SharedTabName[];
}
