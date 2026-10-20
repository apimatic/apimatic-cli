import { PortalConfig } from './portal-config.js';

const HEADER = "// Written by the APIMatic CLI from the 'portal' block of src/apimatic.json. Edit that instead.";

/**
 * The build project's `src/lib/copilot-entry.ts`, which the layout takes the Ask AI chat from. The chat's
 * `import()` is written only for a portal that offers it: the build makes a chunk of any `import()` it
 * finds, so a portal without the chat would otherwise ship the chat's code. Rewritten whole, as
 * `portal serve` does when the block changes; rendered here so the module is tested without a build.
 */
export class PortalCopilotEntry {
  private constructor(private readonly chat: boolean) {}

  public static of(config: PortalConfig): PortalCopilotEntry {
    return new PortalCopilotEntry(config.copilotService() !== null);
  }

  public toString(): string {
    const body = this.chat
      ? [
          '// In a chunk of its own, loaded only by this portal, which offers the chat.',
          "import { lazy } from 'react';",
          '',
          "export const CopilotLayout = lazy(() => import('@/components/copilot'));"
        ]
      : [
          '// This portal offers no Ask AI chat, so nothing here imports it, and the build leaves it out.',
          "import type CopilotLayoutComponent from '@/components/copilot';",
          '',
          'export const CopilotLayout: typeof CopilotLayoutComponent | null = null;'
        ];
    return [HEADER, ...body].join('\n').concat('\n');
  }
}
