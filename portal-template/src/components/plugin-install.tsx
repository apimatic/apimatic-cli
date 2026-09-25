import { useSyncExternalStore } from 'react';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { installAddress } from '@/lib/install-address';
import { portal } from '@/lib/portal';

// The origin never changes while the page is open, so there is nothing to subscribe to.
const noSubscribe = () => () => {};

/**
 * The install command, with a path on the portal made absolute. The prerendered page cannot know
 * where it will be hosted, so it uses the configured address, or the bare path; the browser then
 * swaps in the origin it actually loaded the page from, which is right on any host.
 */
export function PluginInstall({ path }: Readonly<{ path: string }>) {
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
          <span className="line">npx context-plugins install {installAddress(path, origin)}</span>
        </code>
      </Pre>
    </CodeBlock>
  );
}
