// The Ask AI copilot: Fumadocs' AI chat panel, answered by the Ask AI service (the portal is static).
// `@fumadocs/ai-chat` is 0.x and needs fumadocs-ui >= 16.16: keep it pinned and check the chat on every upgrade.
import { useMemo, useState, type ReactNode } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { AIChatPanel, AIChatProvider, AIChatSearch, AIChatSources, AIChatTrigger, useAIChat } from '@fumadocs/ai-chat';
import type { AIChatOptions } from 'fumadocs-ui/layouts/shared';
import { withBasePath } from '@/lib/base-path';
import { CopilotClient } from '@/lib/copilot-client';
import type { PortalCopilot } from '@/lib/portal-types';

/** One part of a chat message: text, a tool call, a data part, and so on. */
type Part = UIMessage['parts'][number];
// Taken from the components themselves, so they cannot drift.
type SearchPart = Parameters<typeof AIChatSearch>[0]['part'];
type Sources = Parameters<typeof AIChatSources>[0]['sources'];

/**
 * The docs layout with the Ask AI chat around it. The module's one export, so the layout can load
 * it on its own, and only for a portal that offers the chat.
 */
export default function CopilotLayout({
  copilot,
  layout
}: Readonly<{ copilot: PortalCopilot; layout: (aiChat: AIChatOptions) => ReactNode }>) {
  return (
    <CopilotProvider copilot={copilot}>
      <WithPanel layout={layout} />
    </CopilotProvider>
  );
}

// Separate, because the panel state exists only inside `CopilotProvider`.
function WithPanel({ layout }: Readonly<{ layout: (aiChat: AIChatOptions) => ReactNode }>) {
  return layout(useCopilotPanel());
}

/** The chat state and the "Ask AI" button; wraps the layout so a conversation survives navigation. */
function CopilotProvider({ copilot, children }: Readonly<{ copilot: PortalCopilot; children: ReactNode }>) {
  // Turned away by the service (disabled, unknown key, another website): the portal shows no Ask AI at all.
  const [available, setAvailable] = useState(true);
  const client = useMemo(() => new CopilotClient(copilot, () => setAvailable(false)), [copilot]);
  const transport = useMemo(() => chatTransport(client), [client]);
  const chat = useChat({ transport, onData: client.noteData });
  const suggestions = copilot.suggestions.length > 0 ? copilot.suggestions : undefined;
  return (
    <AIChatProvider chat={chat} renderPart={renderPart} suggestions={suggestions}>
      {children}
      {available && <AIChatTrigger />}
    </AIChatProvider>
  );
}

/** The docs layout's `aiChat` option: the panel and whether it is open. Call inside `CopilotProvider`. */
function useCopilotPanel(): AIChatOptions {
  const { open, setOpen } = useAIChat();
  return { open, onOpenChange: setOpen, panel: <AIChatPanel /> };
}

/**
 * Draws the non-text parts the service sends; the panel draws text itself.
 * A new part type from the service needs a branch here, or it is not shown.
 */
function renderPart(part: Part, live: boolean): ReactNode {
  // "Searched · N results", expandable to the pages the answer was based on.
  if (part.type === 'tool-search') return <AIChatSearch part={servedSearch(part as SearchPart)} live={live} />;
  // The numbered source chips, matching the [1], [2] citations in the answer.
  if (part.type === 'data-sources') return <AIChatSources sources={servedSources(part.data as Sources)} />;
  return null;
}

// The service links pages by their path within the portal; the host serves them under the base path.
function servedSearch(part: SearchPart): SearchPart {
  return {
    ...part,
    output: part.output?.map((found) => ({ doc: found.doc && { ...found.doc, url: withBasePath(found.doc.url) } }))
  };
}

function servedSources(sources: Sources): Sources {
  return sources.map((source) => ({ ...source, url: withBasePath(source.url) }));
}

function chatTransport(client: CopilotClient): DefaultChatTransport<UIMessage> {
  // The token is the only credential; the portal's cookies are never sent.
  return new DefaultChatTransport<UIMessage>({
    credentials: 'omit',
    fetch: client.fetch,
    prepareSendMessagesRequest: ({ messages, trigger }) => ({
      api: client.chatAddress(),
      body: client.questionBody(messages, trigger)
    })
  });
}
