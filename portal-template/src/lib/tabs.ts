import type * as PageTree from 'fumadocs-core/page-tree';
import type { LayoutTab } from 'fumadocs-ui/layouts/shared';

/**
 * One tab per root folder at the top of the tree, which is every top-level node once the tabs
 * transformer has run. Given to the layouts rather than left to Fumadocs, which links a tab to
 * its folder's first direct page and so leaves out a tab holding only folders -- as the API
 * reference does whenever its operations are grouped. Each stays bound to its folder, which is
 * how the active tab is found.
 */
export function portalTabs(tree: PageTree.Root): LayoutTab[] {
  return tree.children.flatMap((node) => {
    if (node.type !== 'folder' || node.root !== true) return [];
    const url = firstPageUrl(node);
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
