import type * as PageTree from 'fumadocs-core/page-tree';
import type { LayoutTab } from 'fumadocs-ui/layouts/shared';
import { containsUrl, docsRoute, HOME_TAB_ID } from './shared';

/**
 * One tab per root folder at the top of the tree, which is every top-level node once the tabs
 * transformer has run. Given to the layout rather than left to Fumadocs, which links a tab to
 * its folder's first direct page and so leaves out a tab holding only folders -- as the API
 * reference does whenever its operations are grouped. Each stays bound to its folder, which is
 * how the active tab is found.
 *
 * None when Home is the only tab, as it is whenever the root `nav.json`'s `tabs` names nothing,
 * or there is no such file: a switcher with one choice switches nothing, and the layout renders
 * no tab bar over an empty list.
 */
export function portalTabs(tree: PageTree.Root): LayoutTab[] {
  const roots = tree.children.filter((node): node is PageTree.Folder => node.type === 'folder' && node.root === true);
  if (roots.length === 1 && roots[0].$id === HOME_TAB_ID) return [];

  return roots.flatMap((node) => {
    // Home keeps the order the root nav.json gives, which need not put the home page first.
    const url = containsUrl([node], docsRoute) ? docsRoute : firstPageUrl(node);
    return url === undefined
      ? []
      : [{ title: node.name, description: node.description, icon: node.icon, url, $folder: node }];
  });
}

/**
 * Depth first, as the sidebar lists them, so the tab opens on the page at its top. A link
 * that leaves the portal is passed over, as Fumadocs passes it over for a folder's own link.
 */
function firstPageUrl(folder: PageTree.Folder): string | undefined {
  if (folder.index !== undefined) return folder.index.url;
  for (const child of folder.children) {
    if (child.type === 'page' && !child.external) return child.url;
    if (child.type === 'folder') {
      const url = firstPageUrl(child);
      if (url !== undefined) return url;
    }
  }
  return undefined;
}
