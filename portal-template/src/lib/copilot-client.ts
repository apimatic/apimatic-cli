import type { PortalCopilot } from './portal-types';

/** Why Ask AI is unavailable: the service turned this portal, its key or this website away. */
const TURNED_AWAY = new Set(['copilot_disabled', 'invalid_key', 'origin_not_allowed']);
/** A session is renewed this long before it expires, so a question never meets a stale one. */
const RENEW_EARLY_MS = 30_000;

interface Problem {
  code?: string;
  message?: string;
  upgradeUrl?: unknown;
}

/** A portal whose APIMatic plan no longer includes Ask AI: what to tell visitors, and where its owner upgrades. */
export interface LapsedPlan {
  message: string;
  upgradeUrl: string;
}

/**
 * Whether the service lets this portal offer Ask AI: `checking` until its first answer, hidden when turned away,
 * explained when the plan lapsed.
 */
export type Availability = 'checking' | 'available' | 'hidden' | LapsedPlan;

/** The page a visitor asks from, as the browser reports it. */
export interface AskingPage {
  href: string;
  title: string;
}

/** The chat's own question, its page named without query or fragment, which can hold an OAuth callback's code. */
export function questionMessage(text: string, { href, title }: AskingPage) {
  const page = new URL(href);
  return {
    role: 'user' as const,
    parts: [
      { type: 'data-client' as const, data: { location: `${page.origin}${page.pathname}`, title } },
      { type: 'text' as const, text }
    ]
  };
}

/**
 * The Ask AI service as the chat panel sees it. The public key opens a short session; questions
 * carry the session's token, never the key, and the service names the conversation's thread.
 * These paths ship inside published portals, so the service must keep serving them; a breaking
 * change needs a new `/v2` path.
 */
export class CopilotClient {
  private session: Promise<{ token: string; expiresAt: number }> | null = null;
  private thread: string | null = null;

  constructor(
    private readonly copilot: Pick<PortalCopilot, 'key' | 'apiUrl'>,
    /** Called with the lapsed plan to explain, or null to hide Ask AI altogether. */
    private readonly turnedAway: (lapsed: LapsedPlan | null) => void,
    private readonly send: typeof fetch = (input, init) => fetch(input, init)
  ) {}

  readonly chatAddress = (): string => `${this.copilot.apiUrl}/v1/chat`;

  /**
   * Opens the session before anyone types, as the button is pointed at or the panel opens, so a portal the service
   * turns away says so at once. Resolves either way; a refusal reaches `turnedAway` first.
   */
  readonly prepare = async (): Promise<void> => {
    await this.currentSession().catch(() => undefined);
  };

  /** The body for one question: only the latest message, since the service keeps the thread. */
  questionBody(messages: readonly unknown[], trigger: string): Record<string, unknown> {
    if (messages.length <= 1) this.thread = null;
    return { threadId: this.thread, trigger, message: messages.at(-1) };
  }

  /** Remembers the thread the service started, from its `data-thread` part. */
  readonly noteData = (part: { type: string; data?: unknown }): void => {
    if (part.type !== 'data-thread') return;
    const threadId = (part.data as { threadId?: unknown } | undefined)?.threadId;
    if (typeof threadId === 'string') this.thread = threadId;
  };

  /**
   * The chat transport's fetch: adds the session token, renews an expired session once, and turns
   * the service's error bodies into the message the panel shows.
   */
  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    let response = await this.send(input, await this.authorised(init));
    if (response.status === 401) {
      this.session = null;
      response = await this.send(input, await this.authorised(init));
    }
    if (response.ok) return response;
    const problem = await problemOf(response);
    this.turnAwayOn(problem);
    return new Response(problem.message ?? 'Ask AI could not answer just now. Please try again shortly.', {
      status: response.status
    });
  };

  private async authorised(init: RequestInit): Promise<RequestInit> {
    const { token } = await this.currentSession();
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return { ...init, headers, credentials: 'omit' };
  }

  private currentSession(): Promise<{ token: string; expiresAt: number }> {
    const session = this.session;
    if (session) {
      return session.then((current) => (current.expiresAt - RENEW_EARLY_MS > Date.now() ? current : this.renew()));
    }
    return this.renew();
  }

  private renew(): Promise<{ token: string; expiresAt: number }> {
    const opened = this.open();
    this.session = opened;
    opened.catch(() => {
      if (this.session === opened) this.session = null;
    });
    return opened;
  }

  private async open(): Promise<{ token: string; expiresAt: number }> {
    let response: Response;
    try {
      response = await this.send(`${this.copilot.apiUrl}/v1/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: this.copilot.key }),
        credentials: 'omit'
      });
    } catch {
      throw new Error('Ask AI is unavailable right now. Please try again later.');
    }
    if (!response.ok) {
      const problem = await problemOf(response);
      this.turnAwayOn(problem);
      throw new Error(problem.message ?? 'Ask AI is unavailable for this portal.');
    }
    const { token, expiresAt } = (await response.json()) as { token: string; expiresAt: string };
    return { token, expiresAt: Date.parse(expiresAt) };
  }

  private turnAwayOn(problem: Problem): void {
    if (TURNED_AWAY.has(problem.code ?? '')) this.turnedAway(lapsedPlan(problem));
  }
}

/** Only the service's lapsed-plan body explains itself; the kill switch, and older services, hide Ask AI. */
function lapsedPlan({ code, message, upgradeUrl }: Problem): LapsedPlan | null {
  if (code !== 'copilot_disabled' || typeof message !== 'string' || typeof upgradeUrl !== 'string') return null;
  return isWebAddress(upgradeUrl) ? { message, upgradeUrl } : null;
}

// The address becomes a link, which must never run script.
function isWebAddress(value: string): boolean {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function problemOf(response: Response): Promise<Problem> {
  try {
    return (await response.json()) as Problem;
  } catch {
    return {};
  }
}
