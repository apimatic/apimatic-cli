import { useMemo, type ReactNode } from 'react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsLayout as NotebookLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from './layout.shared';
import { portalTabs } from './tabs';

export function PortalLayout({ tree, children }: Readonly<{ tree: PageTree.Root; children: ReactNode }>) {
  const base = baseOptions();
  const tabs = useMemo(() => portalTabs(tree), [tree]);
  // The header spans the page, and `navbar` puts the tab switcher in it rather than the sidebar.
  return (
    <NotebookLayout {...base} nav={{ ...base.nav, mode: 'top' }} tabMode="navbar" tree={tree} tabs={tabs}>
      {children}
    </NotebookLayout>
  );
}
