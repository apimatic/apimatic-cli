import type { ReactNode } from 'react';
import { asMarkdown } from 'fumadocs-core/server';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { ArrowDownToLine, ExternalLink as ExternalLinkIcon } from 'lucide-react';

export interface SdkActionsProps {
  download: string;
  /** Empty when no source repository is recorded. */
  source: string;
  /** Empty until a release is recorded. */
  packageUrl: string;
  registry: string;
}

export const LINK =
  'inline-flex items-center gap-1.5 rounded-sm text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring';

export const QUIET_LINK = `${LINK} text-fd-muted-foreground hover:text-fd-foreground`;

const BUTTON = 'gap-1.5 px-3';

/** The language page's buttons: Download SDK, then the package and the source when they are recorded. */
export function SdkActions({ download, source, packageUrl, registry }: Readonly<SdkActionsProps>) {
  // The page's Markdown twin, which the page actions and llms-full.txt hand to an AI assistant.
  if (asMarkdown()) {
    const links = [
      `[Download SDK](${download})`,
      packageUrl ? `[View on ${registry}](${packageUrl})` : null,
      source ? `[View source](${source})` : null
    ];
    return links.filter((link) => link !== null).join(' · ');
  }
  const secondary = buttonVariants({ color: 'secondary', className: BUTTON });
  return (
    <div className="not-prose flex flex-wrap items-center gap-3">
      <DownloadLink href={download} leads />
      {packageUrl ? (
        <ExternalLink href={packageUrl} className={secondary}>
          View on {registry}
        </ExternalLink>
      ) : null}
      {source ? (
        <ExternalLink href={source} className={secondary}>
          View source
        </ExternalLink>
      ) : null}
    </div>
  );
}

/** A plain link, not a route: the zip is a file the site serves beside its pages. */
export function DownloadLink({ href, leads }: Readonly<{ href: string; leads: boolean }>) {
  return (
    <a
      href={href}
      download
      className={leads ? buttonVariants({ color: 'primary', className: BUTTON }) : `${QUIET_LINK} font-medium`}
    >
      Download SDK
      <ArrowDownToLine className="size-4" />
    </a>
  );
}

export function ExternalLink({
  href,
  className,
  children
}: Readonly<{ href: string; className: string; children: ReactNode }>) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <ExternalLinkIcon className="size-3.5" />
    </a>
  );
}
