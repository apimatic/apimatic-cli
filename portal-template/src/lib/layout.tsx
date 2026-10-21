import { Suspense, useMemo, useState, type ReactNode } from 'react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsLayout as NotebookLayout } from 'fumadocs-ui/layouts/notebook';
import type { AIChatOptions } from 'fumadocs-ui/layouts/shared';
import { WithoutChatOnError } from '@/components/without-chat-on-error';
import { CopilotChat } from './copilot-entry';
import type { PortalCopilot } from './portal-types';
import { baseOptions } from './layout.shared';
import { portal } from './portal';
import { portalTabs } from './tabs';

type LayoutProps = Readonly<{ tree: PageTree.Root; children: ReactNode }>;

export function PortalLayout({ tree, children }: LayoutProps) {
  // Null for a portal without `portal.ai.copilot`, whose build then carries none of the chat.
  if (CopilotChat === null || portal.copilot === null) return <Notebook tree={tree}>{children}</Notebook>;
  return (
    <WithChat chat={CopilotChat} copilot={portal.copilot} tree={tree}>
      {children}
    </WithChat>
  );
}

type ChatProps = LayoutProps & Readonly<{ chat: NonNullable<typeof CopilotChat>; copilot: PortalCopilot }>;

/** The chat beside the layout, not around it, so a page hydrates without waiting for the chat's chunk. */
function WithChat({ chat: Chat, copilot, tree, children }: ChatProps) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  // `contents`, so the chat's panel lays out as the slot's own child.
  const aiChat = useMemo(
    () => ({ open, onOpenChange: setOpen, panel: <div ref={setPanel} className="contents" /> }),
    [open]
  );
  return (
    <>
      <Notebook tree={tree} aiChat={aiChat}>
        {children}
      </Notebook>
      {/* The prerender waits for the chunk, so each page carries the chat's button. */}
      <WithoutChatOnError>
        <Suspense fallback={null}>
          <Chat copilot={copilot} open={open} onOpenChange={setOpen} panel={panel} />
        </Suspense>
      </WithoutChatOnError>
    </>
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
