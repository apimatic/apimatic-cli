import { Link } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { linkTarget } from '@/lib/link-target';

type RouterLinkProps = ComponentProps<'a'> & { prefetch?: boolean };

/**
 * Fumadocs' link for TanStack Router, handing the router a link to a section as its page and its heading.
 * A link within the page (`#…`) is left to the browser, as Fumadocs does.
 * Remove it once fumadocs-core passes the hash itself: https://github.com/fuma-nama/fumadocs/issues/3758.
 */
export function RouterLink({ href, prefetch = true, ...props }: Readonly<RouterLinkProps>) {
  if (href === undefined || href.startsWith('#')) return <a href={href} {...props} />;
  return <Link {...linkTarget(href)} preload={prefetch ? 'intent' : false} {...props} />;
}
