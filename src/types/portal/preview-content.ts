import { ContentNotices } from './content-notices.js';
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
      folderTabs: whenAnyNew(current.folderTabs, previous.folderTabs, (left, right) => left.isEqual(right)),
      sharedTabNames: whenAnyNew(current.sharedTabNames, previous.sharedTabNames, isSameSharedName)
    };
  }
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
