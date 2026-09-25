import { useSyncExternalStore } from 'react';
import { asMarkdown } from 'fumadocs-core/server';
import { CommandBlock } from './command-block';
import { installCommand } from '@/lib/install-command';
import { portal } from '@/lib/portal';

// The origin never changes while the page is open, so there is nothing to subscribe to.
const noSubscribe = () => () => {};

/** The prerender cannot know where the portal is hosted, so the browser swaps in its own origin. */
export function PluginInstall({ path }: Readonly<{ path: string }>) {
  // Ahead of the hook, which only React may call; either branch is taken in every render of one environment.
  if (asMarkdown()) {
    return <CommandBlock command={installCommand(path, portal.siteUrl)} />;
  }
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => portal.siteUrl
  );
  return <CommandBlock command={installCommand(path, origin)} />;
}
