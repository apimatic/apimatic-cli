import type * as PageTree from 'fumadocs-core/page-tree';
import type { LayoutTab } from 'fumadocs-ui/layouts/shared';

/**
 * One tab per root folder at the top of the tree, which is every top-level node once the tabs
 * transformer has run. Given to the layouts rather than left to Fumadocs, which links a tab to
 * its folder's first direct page and so leaves out a tab holding only folders -- the API
 * reference always does. Each stays bound to its folder, which is how the active tab is found.
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

/** Depth first, as the sidebar lists them, so the tab opens on the page at its top. */
function firstPageUrl(folder: PageTree.Folder): string | undefined {
  if (folder.index !== undefined) return folder.index.url;
  for (const child of folder.children) {
    const url = child.type === 'page' ? child.url : child.type === 'folder' ? firstPageUrl(child) : undefined;
    if (url !== undefined) return url;
  }
  return undefined;
}
