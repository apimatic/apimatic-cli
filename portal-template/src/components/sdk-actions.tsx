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

const LINK =
  'inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring rounded-sm';

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
      {/* A plain link, not a route: the zip is a file the site serves beside its pages. */}
      <a href={download} download className={leads ? buttonVariants({ color: 'primary', className: 'gap-1.5' }) : LINK}>
        <Download className="size-4" />
        Download SDK
      </a>
      {source ? (
        <ExternalLink href={source} icon={<Code className="size-4" />}>
          View source
        </ExternalLink>
      ) : null}
      {packageUrl ? (
        <ExternalLink href={packageUrl} icon={<Package className="size-4" />}>
          View on {registry}
        </ExternalLink>
      ) : null}
    </div>
  );
}

function ExternalLink({ href, icon, children }: Readonly<{ href: string; icon: ReactNode; children: ReactNode }>) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {icon}
      {children}
    </a>
  );
}
