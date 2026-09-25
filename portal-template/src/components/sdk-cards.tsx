import type { ReactNode } from 'react';
import Link from 'fumadocs-core/link';
import { LanguageLogo } from './logos';
import { SdkActions, type SdkActionsProps } from './sdk-actions';

interface SdkCardProps extends SdkActionsProps {
  language: string;
  name: string;
  /** The language's own page. */
  page: string;
  /** Empty, as `version` is, until a release is recorded. */
  packageName: string;
  version: string;
}

// One card per row: side by side, a card is too narrow for its three buttons.
export function SdkCards({ children }: Readonly<{ children?: ReactNode }>) {
  return <div className="not-prose my-6 flex flex-col gap-3">{children}</div>;
}

// Not a Fumadocs `Card`, which is one link as a whole: the buttons inside would be links in a link.
export function SdkCard({ language, name, page, packageName, version, ...actions }: Readonly<SdkCardProps>) {
  const release = version ? `${packageName} · v${version.replace(/^v/i, '')}` : null;
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-fd-card p-4 text-fd-card-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between">
      {/* The buttons keep their row beside it; a long package name is cut short instead. */}
      <Link href={page} className="group flex min-w-0 items-center gap-3">
        <LanguageLogo language={language} className="size-10 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium group-hover:underline">{name}</span>
          {release ? (
            <span className="truncate text-sm text-fd-muted-foreground" title={release}>
              {release}
            </span>
          ) : null}
        </span>
      </Link>
      <div className="sm:shrink-0">
        <SdkActions {...actions} />
      </div>
    </div>
  );
}
