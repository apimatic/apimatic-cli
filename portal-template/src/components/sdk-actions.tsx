import type { ReactNode } from 'react';
import { asMarkdown } from 'fumadocs-core/server';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { Code, Download, Package } from 'lucide-react';

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

/** Download, View source and View package: each shown only when there is something behind it. */
export function SdkActions({ download, source, packageUrl, registry }: Readonly<SdkActionsProps>) {
  // The page's Markdown twin, which the page actions and llms-full.txt hand to an AI assistant.
  if (asMarkdown()) {
    const links = [
      `[Download SDK](${download})`,
      source ? `[View source](${source})` : null,
      packageUrl ? `[View on ${registry}](${packageUrl})` : null
    ];
    return links.filter((link) => link !== null).join(' · ');
  }
  // With a package to install from, the download is one way in among others; without one, it is the way in.
  const leads = packageUrl === '';
  return (
    <div className="not-prose flex flex-wrap items-center gap-x-5 gap-y-2">
      <DownloadLink
        href={download}
        className={leads ? buttonVariants({ color: 'primary', className: 'gap-1.5' }) : QUIET_LINK}
      >
        <Download className="size-4" />
        Download SDK
      </DownloadLink>
      {source ? (
        <ExternalLink href={source} className={QUIET_LINK}>
          <Code className="size-4" />
          View source
        </ExternalLink>
      ) : null}
      {packageUrl ? (
        <ExternalLink href={packageUrl} className={QUIET_LINK}>
          <Package className="size-4" />
          View on {registry}
        </ExternalLink>
      ) : null}
    </div>
  );
}

interface LinkProps {
  href: string;
  className: string;
  children: ReactNode;
}

/** A plain link, not a route: the zip is a file the site serves beside its pages. */
export function DownloadLink({ href, className, children }: Readonly<LinkProps>) {
  return (
    <a href={href} download className={className}>
      {children}
    </a>
  );
}

export function ExternalLink({ href, className, children }: Readonly<LinkProps>) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
