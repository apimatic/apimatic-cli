// The Ask AI copilot: Fumadocs' AI chat panel, answered by the Ask AI service (the portal is static).
// `@fumadocs/ai-chat` is 0.x and needs fumadocs-ui >= 16.16: keep it pinned and check the chat on every upgrade.
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { AIChatPanel, AIChatProvider, AIChatSearch, AIChatSources, AIChatTrigger, useAIChat } from '@fumadocs/ai-chat';
import { CopilotClient, questionMessage } from '@/lib/copilot-client';
import type { PortalCopilot } from '@/lib/portal-types';

/** One part of a chat message: text, a tool call, a data part, and so on. */
type Part = UIMessage['parts'][number];
// Taken from the components themselves, so they cannot drift.
type SearchPart = Parameters<typeof AIChatSearch>[0]['part'];
type Sources = Parameters<typeof AIChatSources>[0]['sources'];

/** What the layout hands the chat: whether its panel is open, and where the layout keeps a place for it. */
export type CopilotChatProps = Readonly<{
  copilot: PortalCopilot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element the layout keeps in its panel slot; null until the layout has rendered it. */
  panel: HTMLElement | null;
}>;

/**
 * The Ask AI chat, beside the docs layout rather than around it, so the page hydrates without waiting for
 * this chunk. The module's one export, so the layout can load it on its own, and only for a portal that
 * offers the chat.
 */
export default function CopilotChat({ copilot, open, onOpenChange, panel }: CopilotChatProps) {
  return (
    <CopilotProvider copilot={copilot}>
      <FollowLayout open={open} onOpenChange={onOpenChange} />
      {panel !== null && createPortal(<AIChatPanel />, panel)}
    </CopilotProvider>
  );
}

/**
 * Keeps the chat's open state and the layout's as one: either side may open or close the panel. Each
 * side passes on only a change of its own (both setters are stable), and setting a state to the value it
 * holds changes nothing, so the two settle at once.
 */
function FollowLayout({ open, onOpenChange }: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const chat = useAIChat();
  // The layout's own control closed or opened it.
  useEffect(() => chat.setOpen(open), [open, chat.setOpen]);
  // The chat's button, Ctrl+/ or Escape did.
  useEffect(() => onOpenChange(chat.open), [chat.open, onOpenChange]);
  return null;
}

/** The chat state and the "Ask AI" button; beside the layout, so a conversation survives navigation. */
function CopilotProvider({ copilot, children }: Readonly<{ copilot: PortalCopilot; children: ReactNode }>) {
  // Turned away by the service (disabled, unknown key, another website): the portal shows no Ask AI at all.
  const [available, setAvailable] = useState(true);
  const client = useMemo(() => new CopilotClient(copilot, () => setAvailable(false)), [copilot]);
  const transport = useMemo(() => chatTransport(client), [client]);
  const chat = useChat({ transport, onData: client.noteData });
  const suggestions = copilot.suggestions.length > 0 ? copilot.suggestions : undefined;
  return (
    <AIChatProvider chat={chat} toMessage={askFromThisPage} renderPart={renderPart} suggestions={suggestions}>
      <SessionOnOpen client={client} available={available} />
      {children}
      {available && <AIChatTrigger />}
    </AIChatProvider>
  );
}

// The chat's own message would send the page's whole address, its query and fragment too.
function askFromThisPage(text: string) {
  return questionMessage(text, { href: location.href, title: document.title });
}

/** Opens the session as the panel opens, and keeps the panel shut once the service turns the portal away. */
function SessionOnOpen({ client, available }: Readonly<{ client: CopilotClient; available: boolean }>) {
  const { open, setOpen } = useAIChat();
  useEffect(() => {
    if (open) void client.prepare();
  }, [open, client]);
  // Before paint, so Ctrl+/ on a portal turned away never shows the panel at all.
  useLayoutEffect(() => {
    if (open && !available) setOpen(false);
  }, [open, available, setOpen]);
  return null;
}

/**
 * Draws the non-text parts the service sends; the panel draws text itself.
 * A new part type from the service needs a branch here, or it is not shown.
 * Pages are linked by their path within the portal, as the service sends them: the router adds the base path.
 */
function renderPart(part: Part, live: boolean): ReactNode {
  // "Searched · N results", expandable to the pages the answer was based on.
  if (part.type === 'tool-search') return <AIChatSearch part={part as SearchPart} live={live} />;
  // The numbered source chips, matching the [1], [2] citations in the answer.
  if (part.type === 'data-sources') return <AIChatSources sources={part.data as Sources} />;
  return null;
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
