import type { ReactNode } from 'react';
import Link from 'fumadocs-core/link';
import { asMarkdown } from 'fumadocs-core/server';
import { ArrowRight } from 'lucide-react';
import { CommandBlock } from './command-block';
import { LanguageLogo } from './logos';
import { DownloadLink, ExternalLink, LINK, QUIET_LINK, SdkActions, type SdkActionsProps } from './sdk-actions';

interface SdkCardProps extends SdkActionsProps {
  language: string;
  name: string;
  /** The language's own page. */
  page: string;
  /** Empty until a release is recorded. */
  install: string;
}

// Three to a row on the widest page, fewer as it narrows; `auto-fill` keeps a lone card at a card's width.
export function SdkCards({ children }: Readonly<{ children?: ReactNode }>) {
  if (asMarkdown()) {
    return children;
  }
  return <div className="not-prose my-6 grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">{children}</div>;
}

// Not a Fumadocs `Card`, which is one link as a whole: the links inside would be links in a link.
export function SdkCard({ language, name, page, install, ...actions }: Readonly<SdkCardProps>) {
  if (asMarkdown()) {
    return [`- [${name}](${page}): ${install ? `\`${install}\` · ` : ''}`, <SdkActions key="actions" {...actions} />];
  }
  const { download, source, packageUrl, registry } = actions;
  return (
    <article className="flex flex-col rounded-xl border bg-fd-card text-fd-card-foreground">
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fd-muted">
            <LanguageLogo language={language} className="size-5" />
          </span>
          <h2 className="text-base font-semibold">{name}</h2>
        </div>
        {install ? <CommandBlock command={install} compact /> : null}
        {/* A button's height whether or not the download is one, so the links line up across cards. */}
        <div className="mt-auto flex min-h-9 flex-wrap items-center gap-x-5 gap-y-2">
          {/* With a package to install from, the download is one way in among others; without one, it is the way in. */}
          <DownloadLink href={download} leads={packageUrl === ''} />
          <Link href={page} className={`${LINK} font-medium hover:text-fd-primary`}>
            Overview
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      {packageUrl || source ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5">
          {packageUrl ? (
            <ExternalLink href={packageUrl} className={QUIET_LINK}>
              {registry}
            </ExternalLink>
          ) : null}
          {source ? (
            <ExternalLink href={source} className={QUIET_LINK}>
              Source
            </ExternalLink>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
