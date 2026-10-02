import { FilePath } from '../file/filePath.js';
import { TabEntry } from './portal-navigation.js';
import { SharedTabName } from './portal-tabs.js';

/** The root `nav.json` has no `tabs`, or there is no such file, while nothing positions these root nodes. */
export interface NoTabsListed {
  file: FilePath | undefined;
  /** The sections and the API reference that neither list names, in the order the scaffold lists them. */
  unplaced: TabEntry[];
}

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
  /** Names more than one tab would show, which the build accepts and a reader cannot tell apart. */
  sharedTabNames: SharedTabName[];
  /** Nothing is a tab because no `tabs` says so, while a section or the reference sits in Home unnamed. */
  noTabsListed: NoTabsListed | undefined;
  /** The root `nav.json` that titles Home while Home is the only tab, so no tab bar shows the name. */
  unseenHomeTitle: FilePath | undefined;
}
