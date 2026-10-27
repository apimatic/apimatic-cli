// The Ask AI copilot: Fumadocs' AI chat panel, answered by the Ask AI service (the portal is static).
// `@fumadocs/ai-chat` is 0.x and needs fumadocs-ui >= 16.16: keep it pinned and check the chat on every upgrade.
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  AIChatHeader,
  AIChatPanel,
  AIChatProvider,
  AIChatSearch,
  AIChatSources,
  AIChatTrigger,
  useAIChat
} from '@fumadocs/ai-chat';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { CopilotClient, questionMessage, type LapsedPlan } from '@/lib/copilot-client';
import type { PortalCopilot } from '@/lib/portal-types';

/** One part of a chat message: text, a tool call, a data part, and so on. */
type Part = UIMessage['parts'][number];
// Taken from the components themselves, so they cannot drift.
type SearchPart = Parameters<typeof AIChatSearch>[0]['part'];
type Sources = Parameters<typeof AIChatSources>[0]['sources'];
/** Whether the service lets this portal offer Ask AI: hidden when turned away, explained when the plan lapsed. */
type Availability = 'available' | 'hidden' | LapsedPlan;

/** What the layout hands the chat: whether its panel is open, and where the layout keeps a place for it. */
export type CopilotChatProps = Readonly<{
  copilot: PortalCopilot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element the layout keeps in its panel slot; null until the layout has rendered it. */
  panel: HTMLElement | null;
}>;

/** The module's one export, so the layout can load it on its own, and only for a portal that offers the chat. */
export default function CopilotChat({ copilot, open, onOpenChange, panel }: CopilotChatProps) {
  const [availability, setAvailability] = useState<Availability>('available');
  return (
    <CopilotProvider copilot={copilot} available={availability !== 'hidden'} onTurnedAway={setAvailability}>
      <FollowLayout open={open} onOpenChange={onOpenChange} />
      {panel !== null &&
        createPortal(typeof availability === 'object' ? <LapsedPanel lapsed={availability} /> : <AIChatPanel />, panel)}
    </CopilotProvider>
  );
}

/** In place of the chat once the portal's plan lapsed: why Ask AI is unavailable, and the way to turn it back on. */
function LapsedPanel({ lapsed }: Readonly<{ lapsed: LapsedPlan }>) {
  return (
    <div className="flex size-full flex-col">
      <AIChatHeader />
      <div className="mt-auto flex flex-col items-start gap-3 p-3">
        <p className="text-sm text-fd-muted-foreground">{lapsed.message}</p>
        <a
          href={lapsed.upgradeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ color: 'primary' })}
        >
          Upgrade
        </a>
      </div>
    </div>
  );
}

/** Either side may open or close the panel; each passes on only its own change, so the two settle at once. */
function FollowLayout({ open, onOpenChange }: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const chat = useAIChat();
  // The layout's own control closed or opened it.
  useEffect(() => chat.setOpen(open), [open, chat.setOpen]);
  // The chat's button, Ctrl+/ or Escape did.
  useEffect(() => onOpenChange(chat.open), [chat.open, onOpenChange]);
  return null;
}

type ProviderProps = Readonly<{
  copilot: PortalCopilot;
  available: boolean;
  onTurnedAway: (availability: Availability) => void;
  children: ReactNode;
}>;

/** The chat state and the "Ask AI" button; beside the layout, so a conversation survives navigation. */
function CopilotProvider({ copilot, available, onTurnedAway, children }: ProviderProps) {
  // Turned away by the service (turned off, unknown key, another website): the portal shows no Ask AI at all,
  // unless the portal's plan lapsed, which the panel explains instead.
  const client = useMemo(
    () => new CopilotClient(copilot, (lapsed) => onTurnedAway(lapsed ?? 'hidden')),
    [copilot, onTurnedAway]
  );
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
