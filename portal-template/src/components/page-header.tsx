import { DocsDescription, DocsTitle, MarkdownCopyButton, ViewOptionsPopover } from 'fumadocs-ui/layouts/notebook/page';
import { portal } from '@/lib/portal';

interface PageHeaderProps {
  title?: string;
  description?: string | null;
  markdownUrl: string;
}

/** A page's title, its description when it has one, and the actions on its Markdown twin. */
export function PageHeader({ title, description, markdownUrl }: Readonly<PageHeaderProps>) {
  return (
    <>
      <DocsTitle>{title}</DocsTitle>
      {/* Fumadocs leaves the description out only when it is undefined; a reference page's missing one is null. */}
      <DocsDescription className="mb-4">{description ?? undefined}</DocsDescription>
      <PageActions markdownUrl={markdownUrl} />
    </>
  );
}

function PageActions({ markdownUrl }: Readonly<{ markdownUrl: string }>) {
  return (
    <div className="flex flex-row gap-2 items-center border-b pb-6">
      <MarkdownCopyButton markdownUrl={markdownUrl} />
      {/* Sends the reader to an external AI vendor, so a portal published under someone
          else's brand can turn it off. */}
      {portal.pageActions ? <ViewOptionsPopover markdownUrl={markdownUrl} /> : null}
    </div>
  );
}
