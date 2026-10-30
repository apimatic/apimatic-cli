// The Ask AI copilot: Fumadocs' AI chat panel, answered by the Ask AI service (the portal is static).
// `@fumadocs/ai-chat` is 0.x and needs fumadocs-ui >= 16.16: keep it pinned and check the chat on every upgrade.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { AIChatProvider, AIChatSearch, AIChatSources, AIChatTrigger, useAIChat } from '@fumadocs/ai-chat';
import { CopilotPanel } from '@/components/copilot-panel';
import { CopilotClient, questionMessage, type Availability } from '@/lib/copilot-client';
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

/** The module's one export, so the layout can load it on its own, and only for a portal that offers the chat. */
export default function CopilotChat({ copilot, open, onOpenChange, panel }: CopilotChatProps) {
  const [availability, setAvailability] = useState<Availability>('checking');
  return (
    <CopilotProvider copilot={copilot} availability={availability} onAvailability={setAvailability}>
      <FollowLayout open={open} onOpenChange={onOpenChange} />
      {panel !== null && createPortal(<CopilotPanel availability={availability} />, panel)}
    </CopilotProvider>
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
  availability: Availability;
  onAvailability: Dispatch<SetStateAction<Availability>>;
  children: ReactNode;
}>;

/** The chat state and the "Ask AI" button; beside the layout, so a conversation survives navigation. */
function CopilotProvider({ copilot, availability, onAvailability, children }: ProviderProps) {
  // Turned away by the service (turned off, unknown key, another website): the portal shows no Ask AI at all,
  // unless the portal's plan lapsed, which the panel explains instead.
  const client = useMemo(
    () => new CopilotClient(copilot, (lapsed) => onAvailability(lapsed ?? 'hidden')),
    [copilot, onAvailability]
  );
  const available = availability !== 'hidden';
  // Once turned away, the answer stands for the page's life, so neither a hover nor an open asks the service again.
  const turnedAway = !available || typeof availability === 'object';
  // A session that could not open for any other reason still offers the chat, whose question then says why.
  const prepare = useCallback(() => {
    if (turnedAway) return;
    void client.prepare().then(() => onAvailability((now) => (now === 'checking' ? 'available' : now)));
  }, [client, onAvailability, turnedAway]);
  const transport = useMemo(() => chatTransport(client), [client]);
  const chat = useChat({ transport, onData: client.noteData });
  const suggestions = copilot.suggestions.length > 0 ? copilot.suggestions : undefined;
  return (
    <AIChatProvider chat={chat} toMessage={askFromThisPage} renderPart={renderPart} suggestions={suggestions}>
      <SessionOnOpen prepare={prepare} available={available} />
      {children}
      {/* Hovering or focusing the button opens the session, so the panel usually opens already knowing the answer. */}
      {available && (
        <span className="contents" onPointerEnter={prepare} onFocus={prepare}>
          <AIChatTrigger />
        </span>
      )}
    </AIChatProvider>
  );
}

// The chat's own message would send the page's whole address, its query and fragment too.
function askFromThisPage(text: string) {
  return questionMessage(text, { href: location.href, title: document.title });
}

/**
 * Opens the session as the panel opens, for Ctrl+/ and the layout's own control, which skip the button; and keeps
 * the panel shut once the service turns the portal away.
 */
function SessionOnOpen({ prepare, available }: Readonly<{ prepare: () => void; available: boolean }>) {
  const { open, setOpen } = useAIChat();
  useEffect(() => {
    if (open) prepare();
  }, [open, prepare]);
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
