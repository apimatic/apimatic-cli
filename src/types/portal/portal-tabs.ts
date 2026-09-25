import { DirectoryPath } from '../file/directoryPath.js';
import { FilePath } from '../file/filePath.js';
import { GeneratedSection } from './generated-pages.js';
import { GROUP_FOLDER } from './portal-navigation.js';

/** What a tab is made of. */
export type TabOwner =
  | { kind: 'home' }
  // A folder directly under `content/` that `content/nav.json` lists.
  | { kind: 'folder'; directory: DirectoryPath }
  | { kind: 'apiReference' }
  | { kind: 'generated'; section: GeneratedSection };

/** A tab by the name the tab bar shows for it. */
export interface PortalTab {
  owner: TabOwner;
  name: string;
  /** The `nav.json` or index page whose title gives the name, or null when the portal gives it. */
  namedBy: FilePath | null;
}

/** A name the tab bar would show for more than one tab, which leaves them indistinguishable. */
export interface SharedTabName {
  /** As the first of the tabs spells it; the others may differ from it in case. */
  name: string;
  tabs: PortalTab[];
}

// A reader cannot tell Guides from guides in a tab bar any more than Guides from Guides.
export function sharedTabNames(tabs: PortalTab[]): SharedTabName[] {
  const byName = new Map<string, PortalTab[]>();
  for (const tab of tabs) {
    const key = tab.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), tab]);
  }
  return [...byName.values()]
    .filter((named) => named.length > 1)
    .map((named) => ({ name: named[0].name, tabs: named }));
}

/** The name the template gives a tab that no title names. */
export function untitledTabName(owner: TabOwner): string {
  switch (owner.kind) {
    case 'home':
      return 'Home';
    case 'apiReference':
      return 'API Reference';
    case 'generated':
      return owner.section.title;
    case 'folder':
      return directoryTabName(owner.directory.leafName());
  }
}

/** Fumadocs' name for a folder that nothing names: its directory's, as `pathToName` spells it. */
export function directoryTabName(directoryName: string): string {
  const name = GROUP_FOLDER.exec(directoryName)?.[1] ?? directoryName;
  return [...name]
    .map((character, index) => {
      if (index === 0) {
        return character.toLocaleUpperCase();
      }
      return character === '-' ? ' ' : character;
    })
    .join('');
}
