import type { ReactNode } from 'react';
import Link from 'fumadocs-core/link';
import { asMarkdown } from 'fumadocs-core/server';
import { ChevronRight } from 'lucide-react';
import { CommandBlock } from './command-block';
import { LanguageLogo } from './logos';
import { SdkActions, type SdkActionsProps } from './sdk-actions';

interface SdkCardProps extends SdkActionsProps {
  language: string;
  name: string;
  /** The language's own page. */
  page: string;
  /** Empty, as `version` is, until a release is recorded. */
  install: string;
  version: string;
}

// One card per row, in the configuration's order: the install command wants the width.
export function SdkCards({ children }: Readonly<{ children?: ReactNode }>) {
  if (asMarkdown()) {
    return children;
  }
  return <div className="not-prose my-6 flex flex-col gap-4">{children}</div>;
}

// Not a Fumadocs `Card`, which is one link as a whole: the links inside would be links in a link.
export function SdkCard({ language, name, page, install, version, ...actions }: Readonly<SdkCardProps>) {
  const release = version ? `v${version.replace(/^v/i, '')}` : null;
  if (asMarkdown()) {
    return [
      `- [${name}](${page})${release ? ` ${release}` : ''}: ${install ? `\`${install}\` · ` : ''}`,
      <SdkActions key="actions" {...actions} />
    ];
  }
  return (
    <article className="flex gap-4 rounded-xl border bg-fd-card p-5 text-fd-card-foreground sm:gap-5">
      <LanguageLogo language={language} className="size-10 shrink-0 sm:size-12" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Link href={page} className="group inline-flex items-center gap-1 text-base font-semibold">
            <span className="group-hover:underline underline-offset-4">{name}</span>
            <ChevronRight className="size-4 text-fd-muted-foreground" />
          </Link>
          {release ? <span className="text-sm text-fd-muted-foreground">{release}</span> : null}
        </div>
        {/* The one line most readers came for; the rest of the card stays quiet around it. */}
        {install ? <CommandBlock command={install} className="my-0 rounded-lg bg-fd-secondary shadow-none" /> : null}
        <SdkActions {...actions} />
      </div>
    </article>
  );
}
