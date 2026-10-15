import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsLayout as NotebookLayout } from 'fumadocs-ui/layouts/notebook';
import type { AIChatOptions } from 'fumadocs-ui/layouts/shared';
import { baseOptions } from './layout.shared';
import { portal } from './portal';
import { portalTabs } from './tabs';

type LayoutProps = Readonly<{ tree: PageTree.Root; children: ReactNode }>;

// Its own chunk, so a portal without `portal.ai.copilot` never downloads the chat.
const CopilotLayout = lazy(() => import('@/components/copilot'));

export function PortalLayout({ tree, children }: LayoutProps) {
  if (portal.copilot === null) return <Notebook tree={tree}>{children}</Notebook>;
  // The prerender waits for the chunk, so the fallback only shows if it is slow on a client-side navigation.
  return (
    <Suspense fallback={<Notebook tree={tree}>{children}</Notebook>}>
      <CopilotLayout
        copilot={portal.copilot}
        layout={(aiChat) => (
          <Notebook tree={tree} aiChat={aiChat}>
            {children}
          </Notebook>
        )}
      />
    </Suspense>
  );
}

function Notebook({ tree, aiChat, children }: LayoutProps & { aiChat?: AIChatOptions }) {
  const base = baseOptions();
  const tabs = useMemo(() => portalTabs(tree), [tree]);
  // The header spans the page, and `navbar` puts the tab switcher in it rather than the sidebar.
  return (
    <NotebookLayout
      {...base}
      nav={{ ...base.nav, mode: 'top' }}
      tabMode="navbar"
      tree={tree}
      tabs={tabs}
      aiChat={aiChat}
    >
      {children}
    </NotebookLayout>
  );
}
