import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { isJsonObject } from '../../utils/json-utils.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { FilePath } from '../file/filePath.js';
import { GeneratedSection } from './generated-pages.js';
import { GROUP_FOLDER } from './portal-navigation.js';

/** One tab of the portal's tab bar. */
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
  name: string;
  tabs: PortalTab[];
}

export function sharedTabNames(tabs: PortalTab[]): SharedTabName[] {
  const byName = new Map<string, PortalTab[]>();
  for (const tab of tabs) {
    byName.set(tab.name, [...(byName.get(tab.name) ?? []), tab]);
  }
  return [...byName].filter(([, named]) => named.length > 1).map(([name, named]) => ({ name, tabs: named }));
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

/** The `title` in a page's front matter, read by the parser the build reads it with. */
export function frontMatterTitle(markdown: string): string | undefined {
  let data: unknown;
  try {
    data = frontmatter(markdown).data;
  } catch {
    return undefined;
  }
  return isJsonObject(data) && typeof data.title === 'string' ? data.title : undefined;
}
