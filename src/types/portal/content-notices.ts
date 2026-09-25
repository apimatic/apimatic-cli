import { DirectoryPath } from '../file/directoryPath.js';
import { FilePath } from '../file/filePath.js';
import { SharedTabName, TabOwner } from './portal-tabs.js';

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

/**
 * Each kind of notice in full when it holds something `previous` did not, and empty otherwise:
 * `portal serve` gives a notice on the save that brings it about, not on every save after it.
 */
export function noticesSince(current: ContentNotices, previous: ContentNotices): ContentNotices {
  return {
    hiddenPages: whenAnyNew(current.hiddenPages, previous.hiddenPages, (left, right) => left.isEqual(right)),
    ignoredNavigationFiles: whenAnyNew(current.ignoredNavigationFiles, previous.ignoredNavigationFiles, (left, right) =>
      left.isEqual(right)
    ),
    folderTabs: whenAnyNew(current.folderTabs, previous.folderTabs, (left, right) => left.isEqual(right)),
    sharedTabNames: whenAnyNew(current.sharedTabNames, previous.sharedTabNames, isSameSharedName)
  };
}

function whenAnyNew<T>(current: T[], previous: T[], isSame: (left: T, right: T) => boolean): T[] {
  return current.some((item) => !previous.some((earlier) => isSame(item, earlier))) ? current : [];
}

/** The same name on the same tabs, whichever file gives it to each. */
function isSameSharedName(left: SharedTabName, right: SharedTabName): boolean {
  return (
    left.name === right.name &&
    left.tabs.length === right.tabs.length &&
    left.tabs.every((tab) => right.tabs.some((other) => isSameOwner(tab.owner, other.owner)))
  );
}

function isSameOwner(left: TabOwner, right: TabOwner): boolean {
  switch (left.kind) {
    case 'folder':
      return right.kind === 'folder' && left.directory.isEqual(right.directory);
    case 'generated':
      return right.kind === 'generated' && left.section === right.section;
    default:
      return left.kind === right.kind;
  }
}
