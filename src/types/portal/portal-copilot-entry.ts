import { PortalConfig } from './portal-config.js';

const HEADER = "// Written by the APIMatic CLI from the 'portal' block of src/apimatic.json. Edit that instead.";

/** The layout's `copilot-entry.ts`: the chat's `import()` only where offered, as a build chunks every one it finds. */
export class PortalCopilotEntry {
  private constructor(private readonly chat: boolean) {}

  public static of(config: PortalConfig): PortalCopilotEntry {
    return new PortalCopilotEntry(config.copilotService() !== null);
  }

  public toString(): string {
    const body = this.chat
      ? [
          "// Asked for as the page's own scripts run, so it loads alongside them.",
          "import { lazy } from 'react';",
          '',
          "const chat = import('@/components/copilot');",
          '',
          'export const CopilotChat = lazy(() => chat);'
        ]
      : [
          '// This portal offers no Ask AI chat, so nothing here imports it, and the build leaves it out.',
          "import type CopilotChatComponent from '@/components/copilot';",
          '',
          'export const CopilotChat: typeof CopilotChatComponent | null = null;'
        ];
    return [HEADER, ...body].join('\n').concat('\n');
  }
}
