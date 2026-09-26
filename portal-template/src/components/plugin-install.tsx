import { useSyncExternalStore } from 'react';
import { asMarkdown } from 'fumadocs-core/server';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { installCommand } from '@/lib/install-command';
import { portal } from '@/lib/portal';

// The origin never changes while the page is open, so there is nothing to subscribe to.
const noSubscribe = () => () => {};

/** The prerender cannot know where the portal is hosted, so the browser swaps in its own origin. */
export function PluginInstall({ path }: Readonly<{ path: string }>) {
  // Ahead of the hook, which only React may call; either branch is taken in every render of one environment.
  if (asMarkdown()) {
    return `\`\`\`bash\n${installCommand(path, portal.siteUrl)}\n\`\`\``;
  }
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => portal.siteUrl
  );
  return (
    <CodeBlock>
      <Pre>
        <code>
          {/* A highlighted block's lines carry this class, which is what the block pads. */}
          <span className="line">{installCommand(path, origin)}</span>
        </code>
      </Pre>
    </CodeBlock>
  );
}
