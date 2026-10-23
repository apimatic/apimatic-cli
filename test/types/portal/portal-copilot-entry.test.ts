import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { PortalConfig } from '../../../src/types/portal/portal-config';
import { PortalCopilotEntry } from '../../../src/types/portal/portal-copilot-entry';

describe('PortalCopilotEntry', () => {
  const entryFor = (block: object) =>
    PortalCopilotEntry.of(
      PortalConfig.fromBlock(block, { name: 'Calc', description: null })._unsafeUnwrap()
    ).toString();

  const CHAT_IMPORT = "import('@/components/copilot')";

  it('imports the Ask AI chat, lazily, for a portal that offers it', () => {
    const entry = entryFor({ ai: { copilot: { key: 'pk_test' } } });

    expect(entry).to.contain(`const chat = ${CHAT_IMPORT};`);
    expect(entry).to.contain('export const CopilotChat = lazy(() => chat);');
  });

  // The build makes a chunk of any `import()` it finds; a type-only import leaves nothing behind.
  it('names the chat only as a type for a portal without it, so its build carries none of the chat', () => {
    const entry = entryFor({});

    expect(entry).to.not.contain(CHAT_IMPORT);
    expect(entry).to.contain("import type CopilotChatComponent from '@/components/copilot';");
    expect(entry).to.contain('export const CopilotChat: typeof CopilotChatComponent | null = null;');
  });

  it('is what the template ships, for a portal without the chat', () => {
    const shipped = fs.readFileSync(path.resolve('portal-template', 'src', 'lib', 'copilot-entry.ts'), 'utf8');

    expect(shipped.replace(/\r\n/g, '\n')).to.equal(entryFor({}));
  });
});
