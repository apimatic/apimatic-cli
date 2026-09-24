import { useMemo, type ReactNode } from 'react';
import type * as PageTree from 'fumadocs-core/page-tree';
import type { TOCItemType } from 'fumadocs-core/toc';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import * as docsPage from 'fumadocs-ui/layouts/docs/page';
import { GlassLayout } from 'fumadocs-ui/layouts/glass';
import * as glassPage from 'fumadocs-ui/layouts/glass/page';
import { DocsLayout as NotebookLayout } from 'fumadocs-ui/layouts/notebook';
import * as notebookPage from 'fumadocs-ui/layouts/notebook/page';
import { baseOptions } from './layout.shared';
import { portal } from './portal';
import type { PortalLayout } from './portal-types';
import { portalTabs } from './tabs';

/**
 * What the routes build a page from. Each layout ships its own set, and they differ in the
 * options they take; this is the part the routes use, which all of them accept.
 */
export interface PageComponents {
  DocsPage: (props: { toc?: TOCItemType[]; full?: boolean; children?: ReactNode }) => ReactNode;
  DocsTitle: (props: { children?: ReactNode }) => ReactNode;
  DocsDescription: (props: { children?: ReactNode }) => ReactNode;
  DocsBody: (props: { children?: ReactNode }) => ReactNode;
  MarkdownCopyButton: (props: { markdownUrl: string }) => ReactNode;
  ViewOptionsPopover: (props: { markdownUrl: string }) => ReactNode;
}

// Imported statically, all of them: the choice is the CLI's, read from a JSON module, so the
// bundler cannot know which one is used. The three the portal does not use cost about 40 KB of
// script, 8 KB compressed (measured 2026-09-23), which is not worth a build-time substitution.
const PAGE_COMPONENTS: Record<PortalLayout, PageComponents> = {
  docs: docsPage,
  notebook: notebookPage,
  'notebook-navbar': notebookPage,
  glass: glassPage
};

/** The page components of the layout the portal is configured with. */
export const pageComponents: PageComponents = PAGE_COMPONENTS[portal.layout];

/** The configured layout around a page, with the site's shared header options. */
export function PortalLayout({ tree, children }: Readonly<{ tree: PageTree.Root; children: ReactNode }>) {
  const base = baseOptions();
  const tabs = useMemo(() => portalTabs(tree), [tree]);
  switch (portal.layout) {
    case 'docs':
      return (
        <DocsLayout {...base} tree={tree} tabs={tabs}>
          {children}
        </DocsLayout>
      );
    case 'glass':
      return (
        <GlassLayout {...base} tree={tree} tabs={tabs}>
          {children}
        </GlassLayout>
      );
    case 'notebook':
    case 'notebook-navbar':
      // The header spans the page; `navbar` moves the tab switcher from the sidebar into it.
      return (
        <NotebookLayout
          {...base}
          nav={{ ...base.nav, mode: 'top' }}
          tabMode={portal.layout === 'notebook-navbar' ? 'navbar' : 'sidebar'}
          tree={tree}
          tabs={tabs}
        >
          {children}
        </NotebookLayout>
      );
  }
}
