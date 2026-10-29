import { AIChatHeader, AIChatPanel } from '@fumadocs/ai-chat';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import type { Availability, LapsedPlan } from '@/lib/copilot-client';

/**
 * The panel the layout shows for Ask AI. Until the service has answered, it shows neither the suggested questions
 * nor the input, so a lapsed plan's message replaces a placeholder rather than a chat that was never usable.
 */
export function CopilotPanel({ availability }: Readonly<{ availability: Availability }>) {
  if (typeof availability === 'object') return <LapsedPanel lapsed={availability} />;
  if (availability === 'checking') return <CheckingPanel />;
  return <AIChatPanel />;
}

function CheckingPanel() {
  return (
    <div className="flex size-full flex-col" aria-busy="true">
      <AIChatHeader />
      <p className="mt-auto p-3 text-sm text-fd-muted-foreground">Starting Ask AI…</p>
    </div>
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
