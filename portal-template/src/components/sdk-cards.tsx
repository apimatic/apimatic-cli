import type { ReactNode } from 'react';
import Link from 'fumadocs-core/link';
import { asMarkdown } from 'fumadocs-core/server';
import { ArrowDownToLine, ArrowRight, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { CommandBlock } from './command-block';
import { LanguageLogo, LogoTile } from './logos';
import { DownloadLink, ExternalLink, LINK, QUIET_LINK, SdkActions, type SdkActionsProps } from './sdk-actions';

interface SdkCardProps extends SdkActionsProps {
  language: string;
  name: string;
  /** The language's own page. */
  page: string;
  /** Empty until a release is recorded. */
  install: string;
}

// The height and look of the compact install command, whose place it takes.
const DOWNLOAD_SLOT =
  'flex items-center gap-2 rounded-lg border bg-fd-secondary px-4 py-1.5 text-sm font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring';

// By the width the page gives the cards, not the screen's, so each keeps room for its install command.
export function SdkCards({ children }: Readonly<{ children?: ReactNode }>) {
  if (asMarkdown()) {
    return children;
  }
  return (
    <div className="not-prose @container my-6">
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">{children}</div>
    </div>
  );
}

/** The card's language, for a screen reader's list of links, where every card's would otherwise read the same. */
function LinkContext({ name }: Readonly<{ name: string }>) {
  return <span className="sr-only">, {name}</span>;
}

// Not a Fumadocs `Card`, which is one link as a whole: the links inside would be links in a link.
export function SdkCard({ language, name, page, install, ...actions }: Readonly<SdkCardProps>) {
  if (asMarkdown()) {
    const command = install ? `\`${install}\` · ` : '';
    return [`- [${name}](${page}): ${command}`, <SdkActions key="actions" {...actions} />];
  }
  const { download, source, packageUrl, registry } = actions;
  return (
    <article className="flex flex-col rounded-xl border bg-fd-card text-fd-card-foreground">
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <LogoTile>
            <LanguageLogo language={language} className="size-5" />
          </LogoTile>
          <h2 className="text-base font-semibold">{name}</h2>
        </div>
        {/* The way in: the install command once a package is published, the download until then. */}
        {install ? (
          <CommandBlock command={install} compact />
        ) : (
          <DownloadLink href={download} className={DOWNLOAD_SLOT}>
            <ArrowDownToLine className="size-4" />
            Download SDK
            <LinkContext name={name} />
          </DownloadLink>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          {install ? (
            <DownloadLink href={download} className={`${QUIET_LINK} font-medium`}>
              Download SDK
              <LinkContext name={name} />
              <ArrowDownToLine className="size-4" />
            </DownloadLink>
          ) : null}
          <Link href={page} className={`${LINK} font-medium hover:text-fd-primary`}>
            Overview
            <LinkContext name={name} />
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      {packageUrl || source ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5">
          {packageUrl ? (
            <ExternalLink href={packageUrl} className={QUIET_LINK}>
              {registry}
              <LinkContext name={name} />
              <ExternalLinkIcon className="size-3.5" />
            </ExternalLink>
          ) : null}
          {source ? (
            <ExternalLink href={source} className={QUIET_LINK}>
              Source
              <LinkContext name={name} />
              <ExternalLinkIcon className="size-3.5" />
            </ExternalLink>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
