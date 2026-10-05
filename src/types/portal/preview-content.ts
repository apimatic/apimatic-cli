import { FilePath } from '../file/filePath.js';
import { ContentNotices, NoTabsListed } from './content-notices.js';
import { isSameTabEntry } from './portal-navigation.js';
import { SharedTabName, TabOwner } from './portal-tabs.js';

/** A notice is given once, on the save that brings it about, rather than on every save after it. */
export class PreviewContent {
  private shown: ContentNotices;
  private refused = false;

  /** `startup`: what the checks before the preview started reported. */
  constructor(startup: ContentNotices) {
    this.shown = startup;
  }

  public refuse(): void {
    this.refused = true;
  }

  /**
   * Records the content as shown, and answers whether to say it is fixed, having been refused,
   * and which notices to give: each kind in full when it holds something new, and none otherwise.
   */
  public show(notices: ContentNotices): { fixed: boolean; notices: ContentNotices } {
    const shown = { fixed: this.refused, notices: PreviewContent.since(notices, this.shown) };
    this.refused = false;
    this.shown = notices;
    return shown;
  }

  private static since(current: ContentNotices, previous: ContentNotices): ContentNotices {
    return {
      hiddenPages: whenAnyNew(current.hiddenPages, previous.hiddenPages, (left, right) => left.isEqual(right)),
      ignoredNavigationFiles: whenAnyNew(
        current.ignoredNavigationFiles,
        previous.ignoredNavigationFiles,
        (left, right) => left.isEqual(right)
      ),
      sharedTabNames: whenAnyNew(current.sharedTabNames, previous.sharedTabNames, isSameSharedName),
      noTabsListed: whenNew(current.noTabsListed, previous.noTabsListed, isSameNoTabs),
      unseenHomeTitle: whenNew(current.unseenHomeTitle, previous.unseenHomeTitle, isSameFile)
    };
  }
}

function whenAnyNew<T>(current: T[], previous: T[], isSame: (left: T, right: T) => boolean): T[] {
  return current.some((item) => !previous.some((earlier) => isSame(item, earlier))) ? current : [];
}

function whenNew<T>(
  current: T | undefined,
  previous: T | undefined,
  isSame: (left: T, right: T) => boolean
): T | undefined {
  return current !== undefined && (previous === undefined || !isSame(current, previous)) ? current : undefined;
}

function isSameFile(left: FilePath | undefined, right: FilePath | undefined): boolean {
  return left === undefined || right === undefined ? left === right : left.isEqual(right);
}

function isSameNoTabs(left: NoTabsListed, right: NoTabsListed): boolean {
  return (
    isSameFile(left.file, right.file) &&
    left.unplaced.length === right.unplaced.length &&
    left.unplaced.every((entry, index) => isSameTabEntry(entry, right.unplaced[index]))
  );
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
