import { useMemo, type ReactNode } from 'react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsLayout as NotebookLayout } from 'fumadocs-ui/layouts/notebook';
import type { AIChatOptions } from 'fumadocs-ui/layouts/shared';
import { CopilotProvider, useCopilotPanel } from '@/components/copilot';
import { baseOptions } from './layout.shared';
import { portal } from './portal';
import { portalTabs } from './tabs';

type LayoutProps = Readonly<{ tree: PageTree.Root; children: ReactNode }>;

// Adds the Ask AI panel when `portal.ai.copilot` is set. The chat code is imported statically,
// so it ships in every portal; load it lazily if bundle size matters.
export function PortalLayout({ tree, children }: LayoutProps) {
  if (portal.copilot === null) return <Notebook tree={tree}>{children}</Notebook>;
  return (
    <CopilotProvider copilot={portal.copilot}>
      <NotebookWithCopilot tree={tree}>{children}</NotebookWithCopilot>
    </CopilotProvider>
  );
}

// Separate, because the panel state exists only inside `CopilotProvider`.
function NotebookWithCopilot({ tree, children }: LayoutProps) {
  return (
    <Notebook tree={tree} aiChat={useCopilotPanel()}>
      {children}
    </Notebook>
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
